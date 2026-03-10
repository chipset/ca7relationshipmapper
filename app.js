const treeElement = document.getElementById("tree");
const jobListElement = document.getElementById("job-list");
const searchInput = document.getElementById("job-search");
const selectedJobName = document.getElementById("selected-job-name");
const selectedJobMeta = document.getElementById("selected-job-meta");
const statsElement = document.getElementById("stats");
const expandAllButton = document.getElementById("expand-all");
const collapseAllButton = document.getElementById("collapse-all");
const emptyStateTemplate = document.getElementById("empty-state-template");

const state = {
  data: null,
  filteredJobs: [],
  selectedJob: null,
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

function relationshipEntriesFor(jobName, relationKey) {
  return state.data.jobs[jobName]?.relationships?.[relationKey] ?? [];
}

function updateSelectedMeta(jobName) {
  const job = state.data.jobs[jobName];
  const { incoming, outgoing, total } = job.stats;
  selectedJobName.textContent = jobName;
  selectedJobMeta.textContent = `${formatNumber(total)} relationships, ${formatNumber(outgoing)} outgoing, ${formatNumber(incoming)} incoming`;
}

function setSelectedJob(jobName) {
  if (!state.data.jobs[jobName]) {
    return;
  }

  state.selectedJob = jobName;
  updateSelectedMeta(jobName);
  renderJobList();
  renderTree();
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

function renderJobList() {
  jobListElement.innerHTML = "";
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
    const meta = createNodeTag(
      `${job.stats.total} rel`,
      "job-list-meta"
    );

    button.append(name, meta);
    fragment.append(button);
  });
  jobListElement.append(fragment);
}

function renderTree() {
  treeElement.innerHTML = "";
  if (!state.selectedJob) {
    return;
  }
  treeElement.append(createJobNode(state.selectedJob, new Set(), 0));
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

  const meta = createNodeTag(
    `${job.stats.outgoing} out / ${job.stats.incoming} in`,
    "job-node-meta"
  );

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
  const query = searchInput.value.trim().toUpperCase();
  state.filteredJobs = state.data.jobNames.filter((jobName) => jobName.includes(query));
  if (!state.filteredJobs.includes(state.selectedJob)) {
    state.selectedJob = state.filteredJobs[0] ?? null;
    if (state.selectedJob) {
      updateSelectedMeta(state.selectedJob);
    } else {
      selectedJobName.textContent = "No job selected";
      selectedJobMeta.textContent = "";
    }
  }
  renderJobList();
  renderTree();
}

async function load() {
  const response = await fetch("relationships.json");
  state.data = await response.json();
  renderStats();
  state.filteredJobs = [...state.data.jobNames];
  setSelectedJob(state.data.jobNames[0]);
}

searchInput.addEventListener("input", applyFilter);
expandAllButton.addEventListener("click", expandAll);
collapseAllButton.addEventListener("click", collapseAll);

load().catch((error) => {
  selectedJobName.textContent = "Load failed";
  selectedJobMeta.textContent = error.message;
});
