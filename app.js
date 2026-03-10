const SVG_NS = "http://www.w3.org/2000/svg";

const treeElement = document.getElementById("tree");
const jobListElement = document.getElementById("job-list");
const searchInput = document.getElementById("job-search");
const selectedJobName = document.getElementById("selected-job-name");
const selectedJobMeta = document.getElementById("selected-job-meta");
const statsElement = document.getElementById("stats");
const expandAllButton = document.getElementById("expand-all");
const collapseAllButton = document.getElementById("collapse-all");
const diagramElement = document.getElementById("diagram");
const diagramLegendElement = document.getElementById("diagram-legend");
const diagramBackButton = document.getElementById("diagram-back");
const fileInput = document.getElementById("file-input");
const uploadButton = document.getElementById("upload-button");
const uploadStatus = document.getElementById("upload-status");
const loadedFileName = document.getElementById("loaded-file-name");
const emptyStateTemplate = document.getElementById("empty-state-template");

const PAGE_START_RE = /1LJOB,JOB=\*,LIST=NODD\s+JOB=\*\s+LIST=NODD\s+DATE=\d{2}\.\d{3}\s+PAGE\s+\d{4}/g;
const JOB_NAME_RE = /DATE\/TIME\s+([\$#@A-Z0-9]+)\s+\d{3}\s+/;
const SECTION_RE = /-{10,}\s*([A-Z0-9 /&]+?)\s*-{10,}/g;
const ENTRY_RE = /JOB=([\$#@A-Z0-9]+)\s+SCHID=(\d{3})/g;

const RELATIONSHIP_SECTIONS = {
  "TRIGGERED JOBS": "triggeredJobs",
  "SUCCESSOR JOBS": "successorJobs",
  "TRIGGERED BY JOBS/DATASETS": "triggeredBy",
  REQUIREMENTS: "requirements",
};

const SECTION_LABELS = {
  triggeredJobs: "Triggered Jobs",
  successorJobs: "Successor Jobs",
  triggeredBy: "Triggered By",
  requirements: "Requirements",
};

const DIAGRAM_COLORS = {
  triggeredBy: { fill: "#d7ebf7", stroke: "#2f6f96", text: "#17374f", label: "Triggered By" },
  triggeredJobs: { fill: "#f8d9cf", stroke: "#b4523f", text: "#572016", label: "Triggered Jobs" },
  successorJobs: { fill: "#dcefd8", stroke: "#537c46", text: "#22381c", label: "Successor Jobs" },
  requirements: { fill: "#f7edc9", stroke: "#a18112", text: "#5b4500", label: "Requirements" },
  selected: { fill: "#fff7eb", stroke: "#6b4e1c", text: "#2e2417", label: "Selected Job" },
  overflow: { fill: "#efe5d3", stroke: "#8a7454", text: "#584632", label: "More..." },
};

const state = {
  data: null,
  filteredJobs: [],
  selectedJob: null,
  history: [],
};

function formatNumber(value) {
  return new Intl.NumberFormat().format(value);
}

function createNodeTag(text, className = "") {
  const span = document.createElement("span");
  span.className = className;
  span.textContent = text;
  return span;
}

function resetRegex(regex) {
  regex.lastIndex = 0;
}

function splitBlocks(text) {
  resetRegex(PAGE_START_RE);
  const starts = [];
  let match = PAGE_START_RE.exec(text);
  while (match) {
    starts.push(match.index);
    match = PAGE_START_RE.exec(text);
  }

  const blocks = [];
  starts.forEach((start, index) => {
    const end = index + 1 < starts.length ? starts[index + 1] : text.length;
    blocks.push(text.slice(start, end));
  });
  return blocks;
}

function dedupeEntries(entries) {
  const seen = new Set();
  return entries.filter((entry) => {
    const key = `${entry.job}:${entry.schid}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function emptyRelationships() {
  return {
    triggeredJobs: [],
    successorJobs: [],
    triggeredBy: [],
    requirements: [],
  };
}

function parseBlock(block) {
  resetRegex(JOB_NAME_RE);
  const jobMatch = JOB_NAME_RE.exec(block);
  if (!jobMatch) {
    return null;
  }

  const relationships = emptyRelationships();
  resetRegex(SECTION_RE);
  const sections = Array.from(block.matchAll(SECTION_RE));

  sections.forEach((sectionMatch, index) => {
    const title = sectionMatch[1].trim();
    const relationKey = RELATIONSHIP_SECTIONS[title];
    if (!relationKey) {
      return;
    }

    const bodyStart = sectionMatch.index + sectionMatch[0].length;
    const nextSection = sections[index + 1];
    const bodyEnd = nextSection ? nextSection.index : block.length;
    const body = block.slice(bodyStart, bodyEnd);

    resetRegex(ENTRY_RE);
    for (const entryMatch of body.matchAll(ENTRY_RE)) {
      relationships[relationKey].push({
        job: entryMatch[1],
        schid: entryMatch[2],
      });
    }
  });

  Object.keys(relationships).forEach((key) => {
    relationships[key] = dedupeEntries(relationships[key]);
  });

  return {
    jobName: jobMatch[1],
    relationships,
  };
}

function createCounter() {
  return new Map();
}

function incrementCounter(counter, key) {
  counter.set(key, (counter.get(key) ?? 0) + 1);
}

function buildGraph(rawText, fileName) {
  const jobs = {};
  const parsedJobNames = new Set();
  let parsedPages = 0;
  let skippedPages = 0;

  splitBlocks(rawText).forEach((block) => {
    const parsed = parseBlock(block);
    if (!parsed) {
      skippedPages += 1;
      return;
    }

    parsedPages += 1;
    parsedJobNames.add(parsed.jobName);
    jobs[parsed.jobName] = {
      name: parsed.jobName,
      relationships: parsed.relationships,
    };
  });

  const referencedJobs = new Set();
  const incoming = createCounter();
  const outgoing = createCounter();

  Object.entries(jobs).forEach(([jobName, payload]) => {
    Object.entries(payload.relationships).forEach(([relationKey, entries]) => {
      entries.forEach((entry) => {
        referencedJobs.add(entry.job);
        if (relationKey === "triggeredBy") {
          incrementCounter(incoming, jobName);
          incrementCounter(outgoing, entry.job);
        } else {
          incrementCounter(outgoing, jobName);
          incrementCounter(incoming, entry.job);
        }
      });
    });
  });

  const allJobs = new Set([...Object.keys(jobs), ...referencedJobs]);
  [...allJobs].sort().forEach((jobName) => {
    if (!jobs[jobName]) {
      jobs[jobName] = {
        name: jobName,
        relationships: emptyRelationships(),
      };
    }

    const relationships = jobs[jobName].relationships;
    const explicitIncoming = relationships.triggeredBy.length;
    const explicitOutgoing =
      relationships.triggeredJobs.length +
      relationships.successorJobs.length +
      relationships.requirements.length;

    const incomingCount = parsedJobNames.has(jobName) ? explicitIncoming : incoming.get(jobName) ?? 0;
    const outgoingCount = parsedJobNames.has(jobName) ? explicitOutgoing : outgoing.get(jobName) ?? 0;

    jobs[jobName].stats = {
      incoming: incomingCount,
      outgoing: outgoingCount,
      total: incomingCount + outgoingCount,
    };
  });

  const relationshipCounts = {};
  Object.entries(SECTION_LABELS).forEach(([key, label]) => {
    relationshipCounts[label] = Object.values(jobs).reduce(
      (sum, job) => sum + job.relationships[key].length,
      0
    );
  });

  return {
    generatedFrom: fileName,
    sectionLabels: SECTION_LABELS,
    stats: {
      jobsInSource: parsedPages,
      jobsInGraph: Object.keys(jobs).length,
      jobsReferencedOnly: [...allJobs].filter((jobName) => !parsedJobNames.has(jobName)).length,
      pagesSkipped: skippedPages,
      relationshipCounts,
    },
    jobNames: Object.keys(jobs).sort(),
    jobs,
  };
}

function relationshipEntriesFor(jobName, relationKey) {
  return state.data?.jobs[jobName]?.relationships?.[relationKey] ?? [];
}

function updateSelectedMeta(jobName) {
  const job = state.data.jobs[jobName];
  const { incoming, outgoing, total } = job.stats;
  selectedJobName.textContent = jobName;
  selectedJobMeta.textContent = `${formatNumber(total)} relationships, ${formatNumber(outgoing)} outgoing, ${formatNumber(incoming)} incoming`;
}

function updateBackButton() {
  diagramBackButton.disabled = state.history.length === 0 || !state.data;
}

function setControlsEnabled(enabled) {
  searchInput.disabled = !enabled;
  expandAllButton.disabled = !enabled;
  collapseAllButton.disabled = !enabled;
  diagramBackButton.disabled = !enabled || state.history.length === 0;
}

function resetView() {
  state.filteredJobs = [];
  state.selectedJob = null;
  state.history = [];
  selectedJobName.textContent = "Upload a file";
  selectedJobMeta.textContent = "Choose a CA-7 spool file to parse and display.";
  statsElement.innerHTML = "";
  jobListElement.innerHTML = "";
  treeElement.innerHTML = "";
  diagramElement.innerHTML = "";
  loadedFileName.textContent = "No file loaded";
  setControlsEnabled(false);
}

function setSelectedJob(jobName, options = {}) {
  if (!state.data?.jobs[jobName]) {
    return;
  }

  const { recordHistory = true } = options;
  if (recordHistory && state.selectedJob && state.selectedJob !== jobName) {
    state.history.push(state.selectedJob);
  }

  state.selectedJob = jobName;
  updateSelectedMeta(jobName);
  updateBackButton();
  renderJobList();
  renderDiagram();
  renderTree();
}

function goBack() {
  const previousJob = state.history.pop();
  if (!previousJob) {
    return;
  }
  setSelectedJob(previousJob, { recordHistory: false });
}

function renderStats() {
  const { stats } = state.data;
  statsElement.innerHTML = "";

  const cards = [
    ["Jobs in graph", formatNumber(stats.jobsInGraph)],
    ["Jobs in source", formatNumber(stats.jobsInSource)],
    ["Pages skipped", formatNumber(stats.pagesSkipped)],
  ];

  cards.forEach(([label, value]) => {
    const card = document.createElement("div");
    card.className = "stat-card";
    card.append(createNodeTag(label, "stat-label"));
    card.append(createNodeTag(value, "stat-value"));
    statsElement.append(card);
  });
}

function renderDiagramLegend() {
  diagramLegendElement.innerHTML = "";
  ["triggeredBy", "triggeredJobs", "successorJobs", "requirements"].forEach((key) => {
    const item = document.createElement("div");
    item.className = "legend-item";

    const swatch = document.createElement("span");
    swatch.className = "legend-swatch";
    swatch.style.background = DIAGRAM_COLORS[key].fill;
    swatch.style.borderColor = DIAGRAM_COLORS[key].stroke;

    const label = document.createElement("span");
    label.textContent = DIAGRAM_COLORS[key].label;

    item.append(swatch, label);
    diagramLegendElement.append(item);
  });
}

function renderJobList() {
  jobListElement.innerHTML = "";
  if (!state.data) {
    return;
  }
  if (state.filteredJobs.length === 0) {
    jobListElement.append(emptyStateTemplate.content.cloneNode(true));
    return;
  }

  const fragment = document.createDocumentFragment();
  state.filteredJobs.forEach((jobName) => {
    const button = document.createElement("button");
    const job = state.data.jobs[jobName];
    button.type = "button";
    button.className = `job-list-item${jobName === state.selectedJob ? " is-selected" : ""}`;
    button.addEventListener("click", () => setSelectedJob(jobName));

    const name = createNodeTag(jobName, "job-list-name");
    const meta = createNodeTag(`${job.stats.total} rel`, "job-list-meta");
    button.append(name, meta);
    fragment.append(button);
  });
  jobListElement.append(fragment);
}

function createSvgElement(tagName, attributes = {}) {
  const element = document.createElementNS(SVG_NS, tagName);
  Object.entries(attributes).forEach(([key, value]) => {
    element.setAttribute(key, value);
  });
  return element;
}

function buildColumnNodes(entries, relationKey, x, topY) {
  const maxVisible = 18;
  const visibleEntries = entries.slice(0, maxVisible);
  const nodes = visibleEntries.map((entry, index) => ({
    type: "job",
    job: entry.job,
    schid: entry.schid,
    relationKey,
    x,
    y: topY + index * 82,
  }));

  if (entries.length > maxVisible) {
    nodes.push({
      type: "overflow",
      label: `+${entries.length - maxVisible} more`,
      relationKey,
      x,
      y: topY + maxVisible * 82,
    });
  }

  return nodes;
}

function curvedPath(startX, startY, endX, endY) {
  const curve = Math.max(80, Math.abs(endX - startX) * 0.45);
  return `M ${startX} ${startY} C ${startX + curve} ${startY}, ${endX - curve} ${endY}, ${endX} ${endY}`;
}

function createDiagramNode(node) {
  const width = node.width ?? 190;
  const height = node.height ?? 56;
  const palette = DIAGRAM_COLORS[node.relationKey] ?? DIAGRAM_COLORS.selected;
  const group = createSvgElement("g", { class: "diagram-node-group" });

  const rect = createSvgElement("rect", {
    x: node.x,
    y: node.y,
    rx: 18,
    ry: 18,
    width,
    height,
    fill: palette.fill,
    stroke: palette.stroke,
    "stroke-width": 2,
    class: node.type === "overflow" ? "diagram-node overflow" : "diagram-node",
  });
  group.append(rect);

  const title = createSvgElement("text", {
    x: node.x + 16,
    y: node.y + 24,
    fill: palette.text,
    class: "diagram-node-label",
  });
  title.textContent = node.type === "overflow" ? node.label : node.job;
  group.append(title);

  if (node.type === "job" && node.schid) {
    const meta = createSvgElement("text", {
      x: node.x + 16,
      y: node.y + 42,
      fill: palette.text,
      class: "diagram-node-meta",
    });
    meta.textContent = `SCHID ${node.schid}`;
    group.append(meta);
  } else if (node.relationKey === "selected") {
    const meta = createSvgElement("text", {
      x: node.x + 16,
      y: node.y + 44,
      fill: palette.text,
      class: "diagram-node-meta",
    });
    meta.textContent = `${state.data.jobs[node.job].stats.outgoing} out / ${state.data.jobs[node.job].stats.incoming} in`;
    group.append(meta);
  }

  if (node.type === "job" && node.job !== state.selectedJob) {
    group.classList.add("is-clickable");
    group.addEventListener("click", () => setSelectedJob(node.job));
  }

  return group;
}

function renderDiagram() {
  diagramElement.innerHTML = "";
  if (!state.data || !state.selectedJob) {
    return;
  }

  const selectedJob = state.data.jobs[state.selectedJob];
  const columns = [
    { key: "triggeredBy", title: "Upstream", x: 48 },
    { key: "selected", title: "Selected", x: 410 },
    { key: "triggeredJobs", title: "Triggered", x: 772 },
    { key: "successorJobs", title: "Successors", x: 1074 },
    { key: "requirements", title: "Requirements", x: 1376 },
  ];

  const laneCounts = [
    relationshipEntriesFor(state.selectedJob, "triggeredBy").length,
    1,
    relationshipEntriesFor(state.selectedJob, "triggeredJobs").length,
    relationshipEntriesFor(state.selectedJob, "successorJobs").length,
    relationshipEntriesFor(state.selectedJob, "requirements").length,
  ];
  const maxLaneCount = Math.max(...laneCounts, 1);
  const nodeHeight = 56;
  const rootY = Math.max(140, Math.floor((maxLaneCount * 82) / 2));
  const viewHeight = Math.max(420, rootY * 2 + 160);
  const viewWidth = 1640;

  diagramElement.setAttribute("viewBox", `0 0 ${viewWidth} ${viewHeight}`);
  diagramElement.setAttribute("role", "img");

  columns.forEach((column) => {
    const title = createSvgElement("text", {
      x: column.x,
      y: 54,
      class: "diagram-title",
    });
    title.textContent = column.title;
    diagramElement.append(title);
  });

  const topFor = (count) => Math.max(96, rootY - ((Math.max(count, 1) - 1) * 82) / 2);

  const nodeColumns = {
    triggeredBy: buildColumnNodes(relationshipEntriesFor(state.selectedJob, "triggeredBy"), "triggeredBy", columns[0].x, topFor(laneCounts[0])),
    triggeredJobs: buildColumnNodes(relationshipEntriesFor(state.selectedJob, "triggeredJobs"), "triggeredJobs", columns[2].x, topFor(laneCounts[2])),
    successorJobs: buildColumnNodes(relationshipEntriesFor(state.selectedJob, "successorJobs"), "successorJobs", columns[3].x, topFor(laneCounts[3])),
    requirements: buildColumnNodes(relationshipEntriesFor(state.selectedJob, "requirements"), "requirements", columns[4].x, topFor(laneCounts[4])),
  };

  const rootNode = {
    type: "job",
    job: selectedJob.name,
    schid: null,
    relationKey: "selected",
    x: columns[1].x,
    y: rootY,
    width: 220,
    height: 64,
  };

  Object.entries(nodeColumns).forEach(([relationKey, nodes]) => {
    nodes.forEach((node) => {
      const reverse = relationKey === "triggeredBy";
      const startX = reverse ? node.x + 190 : rootNode.x + rootNode.width;
      const endX = reverse ? rootNode.x : node.x;
      const path = createSvgElement("path", {
        d: curvedPath(startX, node.y + nodeHeight / 2, endX, rootY + rootNode.height / 2),
        class: "diagram-link",
        stroke: DIAGRAM_COLORS[relationKey].stroke,
      });
      diagramElement.append(path);
    });
  });

  Object.values(nodeColumns).flat().forEach((node) => {
    diagramElement.append(createDiagramNode(node));
  });
  diagramElement.append(createDiagramNode(rootNode));
}

function createJobNode(jobName, path, depth) {
  const job = state.data.jobs[jobName];
  const wrapper = document.createElement("details");
  wrapper.className = "job-node";
  wrapper.open = depth < 1;

  const summary = document.createElement("summary");
  summary.className = "job-summary";

  const label = document.createElement("button");
  label.type = "button";
  label.className = `job-label${jobName === state.selectedJob ? " is-selected" : ""}`;
  label.textContent = jobName;
  label.addEventListener("click", (event) => {
    event.preventDefault();
    setSelectedJob(jobName);
  });

  const meta = createNodeTag(`${job.stats.outgoing} out / ${job.stats.incoming} in`, "job-node-meta");
  summary.append(label, meta);
  wrapper.append(summary);

  const content = document.createElement("div");
  content.className = "job-content";

  const nextPath = new Set(path);
  nextPath.add(jobName);

  Object.entries(state.data.sectionLabels).forEach(([relationKey, relationLabel]) => {
    const entries = relationshipEntriesFor(jobName, relationKey);
    if (entries.length === 0) {
      return;
    }

    const section = document.createElement("details");
    section.className = "relation-group";
    section.open = depth < 1;

    const sectionSummary = document.createElement("summary");
    sectionSummary.className = "relation-summary";
    sectionSummary.textContent = `${relationLabel} (${entries.length})`;
    section.append(sectionSummary);

    const list = document.createElement("div");
    list.className = "relation-list";

    entries.forEach((entry) => {
      if (nextPath.has(entry.job)) {
        const cycle = document.createElement("div");
        cycle.className = "cycle-node";
        cycle.textContent = `${entry.job} (${entry.schid}) cycle`;
        list.append(cycle);
        return;
      }

      const childNode = createJobNode(entry.job, nextPath, depth + 1);
      const schid = document.createElement("div");
      schid.className = "schid-pill";
      schid.textContent = `SCHID ${entry.schid}`;

      const container = document.createElement("div");
      container.className = "child-node";
      container.append(schid, childNode);
      list.append(container);
    });

    section.append(list);
    content.append(section);
  });

  if (!content.childElementCount) {
    const empty = document.createElement("p");
    empty.className = "leaf-note";
    empty.textContent = "No direct relationships recorded for this job.";
    content.append(empty);
  }

  wrapper.append(content);
  return wrapper;
}

function renderTree() {
  treeElement.innerHTML = "";
  if (!state.data || !state.selectedJob) {
    return;
  }
  treeElement.append(createJobNode(state.selectedJob, new Set(), 0));
}

function expandAll() {
  treeElement.querySelectorAll("details").forEach((details) => {
    details.open = true;
  });
}

function collapseAll() {
  treeElement.querySelectorAll("details").forEach((details) => {
    details.open = false;
  });
  const root = treeElement.querySelector(".job-node");
  if (root) {
    root.open = true;
  }
}

function applyFilter() {
  if (!state.data) {
    return;
  }

  const query = searchInput.value.trim().toUpperCase();
  state.filteredJobs = state.data.jobNames.filter((jobName) => jobName.includes(query));
  if (!state.filteredJobs.includes(state.selectedJob)) {
    state.selectedJob = state.filteredJobs[0] ?? null;
    if (state.selectedJob) {
      updateSelectedMeta(state.selectedJob);
      renderDiagram();
    } else {
      selectedJobName.textContent = "No job selected";
      selectedJobMeta.textContent = "";
      diagramElement.innerHTML = "";
    }
  }
  renderJobList();
  renderTree();
}

async function loadUploadedFile(file) {
  uploadStatus.textContent = "Parsing file...";
  uploadButton.disabled = true;

  try {
    const rawText = await file.text();
    const data = buildGraph(rawText, file.name);

    state.data = data;
    state.history = [];
    state.filteredJobs = [...data.jobNames];
    loadedFileName.textContent = file.name;
    renderStats();
    renderDiagramLegend();
    setControlsEnabled(true);

    if (data.jobNames.length === 0) {
      selectedJobName.textContent = "No jobs found";
      selectedJobMeta.textContent = "The uploaded file did not contain any CA-7 job pages.";
      uploadStatus.textContent = "Parsed, but no jobs were detected.";
      return;
    }

    setSelectedJob(data.jobNames[0], { recordHistory: false });
    uploadStatus.textContent = `Loaded ${formatNumber(data.stats.jobsInGraph)} jobs from ${file.name}.`;
  } catch (error) {
    state.data = null;
    resetView();
    uploadStatus.textContent = `Unable to parse file: ${error.message}`;
  } finally {
    uploadButton.disabled = false;
  }
}

function onUploadClick() {
  fileInput.value = "";
  fileInput.click();
}

function onFileSelected(event) {
  const [file] = event.target.files ?? [];
  if (!file) {
    return;
  }
  loadUploadedFile(file);
}

searchInput.addEventListener("input", applyFilter);
expandAllButton.addEventListener("click", expandAll);
collapseAllButton.addEventListener("click", collapseAll);
diagramBackButton.addEventListener("click", goBack);
uploadButton.addEventListener("click", onUploadClick);
fileInput.addEventListener("change", onFileSelected);

renderDiagramLegend();
resetView();
