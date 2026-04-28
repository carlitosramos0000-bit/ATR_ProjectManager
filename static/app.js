const STATUS_LIBRARY = [
  "Open",
  "In Progress",
  "Ready for Work",
  "External Pending",
  "Resolved",
  "Closed",
  "Done",
  "Blocked",
  "On Hold",
  "To Do",
  "Backlog",
  "Planned",
];

const DONE_STATUSES = new Set(["closed", "done", "resolved", "completed"]);
const UPCOMING_STATUSES = new Set(["ready for work", "to do", "backlog", "planned"]);
const DEFAULT_PROJECT_SETTINGS = {
  release_weight: 90,
  release_weights: {},
};
const DEFAULT_WORKSPACE_MESSAGES = [
  {
    role: "assistant",
    content: "Estou pronto para trabalhar com o plano atual e gerar respostas executivas ou um steering em PowerPoint.",
  },
];
const RELEASE_KEYWORD_PATTERN = /\brel(?:e)?ase\b/i;
const RELEASE_LABEL_PATTERN = /\brel(?:e)?ase\b(?:\s*[-:/]?\s*[\w.,]+){0,1}/i;
const RELEASE_SUPPORT_PATTERN = /\b(?:test(?:e|es|ing)?|qa|uat|bug(?:\s|-)?fix(?:ing)?|re[\s-]?(?:test(?:ing)?|teste))\b/i;
const RELEASE_SUPPORT_CAP = 10;
const IS_FILE_MODE = window.location.protocol === "file:";
const API_BASE = IS_FILE_MODE ? "http://127.0.0.1:8000" : "";
const STORAGE_KEYS = {
  page: "evolucao-projeto:page",
  project: "evolucao-projeto:project",
};

const PAGE_CONFIG = {
  dashboard: {
    kicker: "Resumo",
    title: "Dashboard Executivo",
  },
  actions: {
    kicker: "Execucao",
    title: "Acoes Prioritarias",
  },
  plan: {
    kicker: "Planeamento",
    title: "Plano Geral",
  },
  timeline: {
    kicker: "Timeline",
    title: "Gantt do Projeto",
  },
  ai: {
    kicker: "Workspace",
    title: "Workspace Executivo",
  },
  setup: {
    kicker: "Configuracao",
    title: "Importacao e Alertas",
  },
};

const state = {
  currentUser: null,
  users: [],
  project: null,
  projects: [],
  alertConfig: null,
  settingsDraft: { ...DEFAULT_PROJECT_SETTINGS },
  editDraft: [],
  isDirty: false,
  currentPage: "dashboard",
  saveState: "idle",
  autoSaveTimer: null,
  aiConfig: null,
  aiMessages: [...DEFAULT_WORKSPACE_MESSAGES],
  lastAiReply: "",
  generatedAiFiles: [],
  aiBusy: false,
};

const els = {
  authOverlay: document.querySelector("#authOverlay"),
  loginForm: document.querySelector("#loginForm"),
  loginUsername: document.querySelector("#loginUsername"),
  loginPassword: document.querySelector("#loginPassword"),
  loginMessage: document.querySelector("#loginMessage"),
  sessionBadge: document.querySelector("#sessionBadge"),
  sessionUserName: document.querySelector("#sessionUserName"),
  sessionUserRole: document.querySelector("#sessionUserRole"),
  logoutButton: document.querySelector("#logoutButton"),
  importForm: document.querySelector("#importForm"),
  projectOptionsForm: document.querySelector("#projectOptionsForm"),
  aiConfigForm: document.querySelector("#aiConfigForm"),
  userCreateForm: document.querySelector("#userCreateForm"),
  userDirectory: document.querySelector("#userDirectory"),
  projectSelect: document.querySelector("#projectSelect"),
  loadProject: document.querySelector("#loadProject"),
  refreshProjects: document.querySelector("#refreshProjects"),
  exportProject: document.querySelector("#exportProject"),
  alertForm: document.querySelector("#alertForm"),
  testAlert: document.querySelector("#testAlert"),
  saveEdits: document.querySelector("#saveEdits"),
  resetEdits: document.querySelector("#resetEdits"),
  addPlanRow: document.querySelector("#addPlanRow"),
  kpiGrid: document.querySelector("#kpiGrid"),
  releaseSummary: document.querySelector("#releaseSummary"),
  dashboardDeadlines: document.querySelector("#dashboardDeadlines"),
  dashboardWelcomeText: document.querySelector("#dashboardWelcomeText"),
  releaseWeightRange: document.querySelector("#releaseWeightRange"),
  releaseWeightNumber: document.querySelector("#releaseWeightNumber"),
  releaseWeightsEditor: document.querySelector("#releaseWeightsEditor"),
  releaseWeightsSummary: document.querySelector("#releaseWeightsSummary"),
  weightSummary: document.querySelector("#weightSummary"),
  saveStateBadge: document.querySelector("#saveStateBadge"),
  projectMeta: document.querySelector("#projectMeta"),
  connectionNotice: document.querySelector("#connectionNotice"),
  sidebarOverviewTitle: document.querySelector("#sidebarOverviewTitle"),
  sidebarOverviewBadge: document.querySelector("#sidebarOverviewBadge"),
  sidebarMiniRing: document.querySelector("#sidebarMiniRing"),
  sidebarMiniStats: document.querySelector("#sidebarMiniStats"),
  sidebarMiniBars: document.querySelector("#sidebarMiniBars"),
  sidebarProjectName: document.querySelector("#sidebarProjectName"),
  sidebarProjectMeta: document.querySelector("#sidebarProjectMeta"),
  pageKicker: document.querySelector("#pageKicker"),
  pageTitle: document.querySelector("#pageTitle"),
  executiveStrip: document.querySelector("#executiveStrip"),
  statusOverview: document.querySelector("#statusOverview"),
  executivePulse: document.querySelector("#executivePulse"),
  activeActions: document.querySelector("#activeActions"),
  upcomingActions: document.querySelector("#upcomingActions"),
  riskActions: document.querySelector("#riskActions"),
  ganttBoard: document.querySelector("#ganttBoard"),
  editorSearch: document.querySelector("#editorSearch"),
  editorFilter: document.querySelector("#editorFilter"),
  editorStatus: document.querySelector("#editorStatus"),
  editorTable: document.querySelector("#editorTable"),
  dashboardSummaryCards: document.querySelector("#dashboardSummaryCards"),
  assigneeSummary: document.querySelector("#assigneeSummary"),
  aiChatForm: document.querySelector("#aiChatForm"),
  aiPrompt: document.querySelector("#aiPrompt"),
  aiMessages: document.querySelector("#aiMessages"),
  aiContextSummary: document.querySelector("#aiContextSummary"),
  downloadLastReply: document.querySelector("#downloadLastReply"),
  generateSteering: document.querySelector("#generateSteering"),
  generateSteeringSecondary: document.querySelector("#generateSteeringSecondary"),
  aiGeneratedFiles: document.querySelector("#aiGeneratedFiles"),
  aiModelLabel: document.querySelector("#aiModelLabel"),
  aiTemplateLabel: document.querySelector("#aiTemplateLabel"),
  quickAiButtons: [...document.querySelectorAll(".quick-ai-btn")],
  setupNav: document.querySelector("#setupNav"),
  navLinks: [...document.querySelectorAll(".nav-link")],
  pageSections: [...document.querySelectorAll(".page-section")],
};

function escapeHtml(text) {
  return String(text ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function apiUrl(path) {
  if (!path.startsWith("/")) return path;
  return `${API_BASE}${path}`;
}

function isAdmin() {
  return Boolean(state.currentUser?.is_admin);
}

function authLabel() {
  if (!state.currentUser) return "Autenticacao necessaria";
  return state.currentUser.is_admin ? "Administrador" : "Utilizador";
}

function resetWorkspaceState() {
  state.project = null;
  state.projects = [];
  state.alertConfig = null;
  state.aiConfig = null;
  state.users = [];
  state.settingsDraft = { ...DEFAULT_PROJECT_SETTINGS };
  state.editDraft = [];
  state.isDirty = false;
  state.saveState = "idle";
  state.aiMessages = [...DEFAULT_WORKSPACE_MESSAGES];
  state.lastAiReply = "";
  state.generatedAiFiles = [];
  state.aiBusy = false;
  if (state.autoSaveTimer) {
    window.clearTimeout(state.autoSaveTimer);
    state.autoSaveTimer = null;
  }
}

function renderLoginMessage(message = "", isError = false) {
  if (!els.loginMessage) return;
  els.loginMessage.textContent = message || "Inicia sessao para abrir o plano, editar o projeto e aceder ao workspace.";
  els.loginMessage.classList.toggle("is-error", Boolean(isError));
  els.loginMessage.classList.toggle("muted", !isError);
}

function renderAuthState() {
  const authenticated = Boolean(state.currentUser);
  document.body.classList.toggle("auth-locked", !authenticated);
  if (els.authOverlay) {
    els.authOverlay.classList.toggle("active", !authenticated);
  }
  if (els.sessionUserName) {
    els.sessionUserName.textContent = authenticated
      ? state.currentUser.display_name || state.currentUser.username
      : "Sessao fechada";
  }
  if (els.sessionUserRole) {
    els.sessionUserRole.textContent = authLabel();
  }
  if (els.sessionBadge) {
    els.sessionBadge.classList.toggle("is-admin", isAdmin());
  }
  if (els.logoutButton) {
    els.logoutButton.disabled = !authenticated;
  }
  if (els.setupNav) {
    els.setupNav.hidden = !isAdmin();
  }
  if (!authenticated) {
    renderLoginMessage();
  }
}

function renderUserDirectory() {
  if (!els.userDirectory) return;
  if (!isAdmin()) {
    els.userDirectory.innerHTML = `<p class="muted">A gestao de utilizadores esta reservada ao administrador.</p>`;
    return;
  }
  if (!state.users.length) {
    els.userDirectory.innerHTML = `<p class="muted">Ainda nao existem utilizadores registados.</p>`;
    return;
  }
  els.userDirectory.innerHTML = state.users
    .map(
      (user) => `
        <article class="user-card">
          <div class="user-card-head">
            <div>
              <strong>${escapeHtml(user.display_name || user.username)}</strong>
              <span>${escapeHtml(user.username)}</span>
            </div>
            <span class="role-pill ${user.is_admin ? "admin" : "user"}">${user.is_admin ? "Admin" : "User"}</span>
          </div>
          <p>Criado em ${escapeHtml(user.created_at ? new Date(user.created_at).toLocaleString("pt-PT") : "n/d")}</p>
          <p>Ultimo acesso: ${escapeHtml(user.last_login_at ? new Date(user.last_login_at).toLocaleString("pt-PT") : "Ainda sem login")}</p>
        </article>`,
    )
    .join("");
}

function parseIsoDate(value) {
  if (!value) return null;
  const parts = String(value).split("-").map(Number);
  if (parts.length !== 3 || parts.some(Number.isNaN)) return null;
  return new Date(parts[0], parts[1] - 1, parts[2], 12, 0, 0, 0);
}

function formatDate(value) {
  const dateValue = parseIsoDate(value);
  return dateValue ? dateValue.toLocaleDateString("pt-PT") : "n/d";
}

function formatCompactDate(value) {
  const dateValue = parseIsoDate(value);
  return dateValue
    ? dateValue.toLocaleDateString("pt-PT", { day: "2-digit", month: "2-digit", year: "2-digit" })
    : "n/d";
}

function capitalizeLabel(value) {
  const text = String(value || "").trim();
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : "";
}

function buildTodayMarker(weeks) {
  if (!weeks?.length) return null;
  const today = new Date();
  today.setHours(12, 0, 0, 0);
  for (let index = 0; index < weeks.length; index += 1) {
    const weekStart = new Date(weeks[index]);
    weekStart.setHours(0, 0, 0, 0);
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 7);
    if (today >= weekStart && today < weekEnd) {
      const elapsedDays = Math.max(0, Math.min(6.999, (today.getTime() - weekStart.getTime()) / 86400000));
      return {
        weekIndex: index,
        offsetPercent: (elapsedDays / 7) * 100,
        label: today.toLocaleDateString("pt-PT"),
      };
    }
  }
  return null;
}

function normalizedStatusKey(status) {
  return String(status || "").trim().toLowerCase();
}

function durationFrom(start, end) {
  const startDate = parseIsoDate(start);
  const endDate = parseIsoDate(end);
  if (!startDate || !endDate) return null;
  const diff = Math.round((endDate.getTime() - startDate.getTime()) / 86400000) + 1;
  return diff > 0 ? diff : null;
}

function releaseNamesFromTasks(tasks = []) {
  const seen = new Set();
  const names = [];
  for (const task of tasks) {
    if (!task?.is_release_item) continue;
    const releaseName = String(task.release || "Issues de Release").trim() || "Issues de Release";
    if (seen.has(releaseName)) continue;
    seen.add(releaseName);
    names.push(releaseName);
  }
  return names;
}

function normalizeProjectSettings(settings = {}, releaseNames = []) {
  const normalized = {
    release_weight: DEFAULT_PROJECT_SETTINGS.release_weight,
    release_weights: {},
  };

  const rawValue = Number(settings.release_weight);
  normalized.release_weight = Number.isFinite(rawValue) ? Math.max(0, Math.min(100, Math.round(rawValue))) : DEFAULT_PROJECT_SETTINGS.release_weight;

  const rawReleaseWeights = settings?.release_weights && typeof settings.release_weights === "object" ? settings.release_weights : {};
  const parsedReleaseWeights = {};
  for (const [name, value] of Object.entries(rawReleaseWeights)) {
    const releaseName = String(name || "").trim();
    if (!releaseName) continue;
    const numericValue = Number(value);
    if (!Number.isFinite(numericValue)) continue;
    parsedReleaseWeights[releaseName] = Math.max(0, Math.round(numericValue * 100) / 100);
  }

  const normalizedReleaseNames = releaseNames.filter(Boolean);
  if (!normalizedReleaseNames.length) {
    normalized.release_weights = parsedReleaseWeights;
    return normalized;
  }

  const positiveWeights = Object.values(parsedReleaseWeights).filter((value) => value > 0);
  let defaultWeight = Math.round((100 / normalizedReleaseNames.length) * 100) / 100;
  if (positiveWeights.length) {
    defaultWeight = Math.round((positiveWeights.reduce((sum, value) => sum + value, 0) / positiveWeights.length) * 100) / 100;
  }

  for (const releaseName of normalizedReleaseNames) {
    normalized.release_weights[releaseName] = parsedReleaseWeights[releaseName] ?? defaultWeight;
  }

  return normalized;
}

function settingsSignature(settings = {}) {
  const normalized = normalizeProjectSettings(settings);
  return JSON.stringify({
    release_weight: normalized.release_weight,
    release_weights: Object.fromEntries(
      Object.entries(normalized.release_weights || {}).sort(([left], [right]) => left.localeCompare(right)),
    ),
  });
}

function lastSavedLabel(project) {
  const updatedAt = project?.updated_at || project?.imported_at;
  return updatedAt ? new Date(updatedAt).toLocaleString("pt-PT") : "n/d";
}

function containsReleaseKeyword(...parts) {
  return parts.some((part) => RELEASE_KEYWORD_PATTERN.test(String(part || "")));
}

function extractReleaseLabel(...parts) {
  for (const part of parts) {
    const text = String(part || "").trim();
    if (!text) continue;
    const match = text.match(RELEASE_LABEL_PATTERN);
    if (match?.[0]) {
      return match[0].replace(/\s+/g, " ").trim().replace(/[-:;/,]+$/g, "");
    }
  }
  return "";
}

function inferReleaseName(task) {
  if (task.release) {
    return String(task.release).trim();
  }
  if (containsReleaseKeyword(task.parent)) {
    return String(task.parent || "").trim();
  }
  const extracted = extractReleaseLabel(task.title, task.type);
  if (extracted) {
    return extracted;
  }
  if (containsReleaseKeyword(task.title, task.type)) {
    return "Issues de Release";
  }
  return "";
}

function classifyReleaseComponent(task) {
  if (!task?.is_release_item) return "";
  const text = [task.title, task.parent, task.type].map((part) => String(part || "").trim()).join(" ");
  if (RELEASE_SUPPORT_PATTERN.test(text)) {
    return "support";
  }
  return "development";
}

function classifyBucket(task) {
  const status = normalizedStatusKey(task.status);
  const today = new Date();
  today.setHours(12, 0, 0, 0);
  const start = parseIsoDate(task.start);
  const end = parseIsoDate(task.end);

  if (DONE_STATUSES.has(status)) return "completed";
  if (end && end < today) return "overdue";
  if (end) {
    const soon = new Date(today);
    soon.setDate(soon.getDate() + 7);
    if (end <= soon) return "due_soon";
  }
  if (start && start > today) return "upcoming";
  if (UPCOMING_STATUSES.has(status)) return "upcoming";
  return "active";
}

function normalizeTask(task, fallbackLine) {
  const normalized = { ...task };
  normalized.status = normalized.status || "Open";
  normalized.title = normalized.title || "";
  normalized.assignee = normalized.assignee || "";
  normalized.parent = normalized.parent || "";
  normalized.notes = normalized.notes || "";
  normalized.release = normalized.release || "";
  normalized.type = normalized.type || "";
  normalized.start = normalized.start || "";
  normalized.end = normalized.end || "";
  normalized.line = normalized.line || fallbackLine;
  normalized.date_conflict = Boolean(normalized.start && normalized.end && normalized.start > normalized.end);

  normalized.release = inferReleaseName(normalized);
  normalized.is_release_item = Boolean(normalized.release || containsReleaseKeyword(normalized.title, normalized.parent, normalized.type));
  normalized.release_component = classifyReleaseComponent(normalized);
  normalized.duration_days = normalized.date_conflict ? null : durationFrom(normalized.start, normalized.end);
  normalized.phase = normalized.parent || normalized.release || "Sem agrupamento";
  normalized.bucket = classifyBucket(normalized.date_conflict ? { ...normalized, start: "", end: "" } : normalized);
  return normalized;
}

function cloneTasks(tasks = []) {
  return tasks.map((task, index) => normalizeTask(task, Number(task.line || index + 4)));
}

function taskSignature(tasks = []) {
  return JSON.stringify(
    tasks.map((task) => ({
      key: task.key || "",
      title: task.title || "",
      type: task.type || "",
      parent: task.parent || "",
      assignee: task.assignee || "",
      status: task.status || "",
      start: task.start || "",
      end: task.end || "",
      notes: task.notes || "",
      release: task.release || "",
      line: task.line || "",
    })),
  );
}

function savedTaskFor(task) {
  if (!state.project?.tasks?.length || !task) return null;
  const key = String(task.key || "").trim();
  if (key) {
    return state.project.tasks.find((item) => String(item.key || "").trim() === key) || null;
  }
  const line = Number(task.line || 0);
  return state.project.tasks.find((item) => Number(item.line || 0) === line) || null;
}

function taskHasDateChange(task) {
  const savedTask = savedTaskFor(task);
  if (!savedTask) return false;
  return String(savedTask.start || "") !== String(task.start || "") || String(savedTask.end || "") !== String(task.end || "");
}

function taskNeedsDateNote(task) {
  return taskHasDateChange(task) && !String(task.notes || "").trim();
}

function taskNotePlaceholder(task) {
  if (taskHasDateChange(task)) {
    return "Justifica aqui a alteracao de datas, dependencias ou bloqueios.";
  }
  return "Notas do item, contexto, bloqueios ou decisoes de steering.";
}

function deriveMetrics(tasks = [], settings = DEFAULT_PROJECT_SETTINGS) {
  const counters = {
    total: tasks.length,
    completed: 0,
    active: 0,
    active_in_progress: 0,
    active_open: 0,
    active_other: 0,
    overdue: 0,
    due_soon: 0,
    upcoming: 0,
  };
  const releaseCounts = new Map();
  const releaseProgress = new Map();
  const assigneeCounts = new Map();
  let releaseTotal = 0;
  let releaseCompleted = 0;
  let nonReleaseTotal = 0;
  let nonReleaseCompleted = 0;

  for (const task of tasks) {
    counters[task.bucket] += 1;
    if (task.bucket === "active") {
      const statusKey = normalizedStatusKey(task.status);
      if (statusKey === "in progress") {
        counters.active_in_progress += 1;
      } else if (statusKey === "open") {
        counters.active_open += 1;
      } else {
        counters.active_other += 1;
      }
    }
    if (task.is_release_item) {
      const releaseName = task.release || "Issues de Release";
      releaseCounts.set(releaseName, (releaseCounts.get(releaseName) || 0) + 1);
      const current = releaseProgress.get(releaseName) || {
        total: 0,
        completed: 0,
        development_total: 0,
        development_completed: 0,
        support_total: 0,
        support_completed: 0,
      };
      current.total += 1;
      if ((task.release_component || classifyReleaseComponent(task)) === "support") {
        current.support_total += 1;
      } else {
        current.development_total += 1;
      }
      releaseTotal += 1;
      if (task.bucket === "completed") {
        current.completed += 1;
        if ((task.release_component || classifyReleaseComponent(task)) === "support") {
          current.support_completed += 1;
        } else {
          current.development_completed += 1;
        }
        releaseCompleted += 1;
      }
      releaseProgress.set(releaseName, current);
    } else {
      nonReleaseTotal += 1;
      if (task.bucket === "completed") {
        nonReleaseCompleted += 1;
      }
    }
    const assigneeName = String(task.assignee || "").trim();
    if (assigneeName && assigneeName.toLowerCase() !== "nan") {
      assigneeCounts.set(assigneeName, (assigneeCounts.get(assigneeName) || 0) + 1);
    }
  }

  const releaseCompletionRatio = releaseTotal ? Math.round((releaseCompleted / releaseTotal) * 1000) / 10 : 0;
  const nonReleaseCompletionRatio = nonReleaseTotal ? Math.round((nonReleaseCompleted / nonReleaseTotal) * 1000) / 10 : 0;
  const releaseNames = releaseNamesFromTasks(tasks);
  const normalizedSettings = normalizeProjectSettings(settings, releaseNames);
  const releaseWeight = normalizedSettings.release_weight / 100;
  const totalReleaseWeightPoints = releaseNames.reduce((sum, name) => sum + Number(normalizedSettings.release_weights?.[name] || 0), 0);
  let weightedReleaseCompletionRatio = 0;
  const releaseBreakdown = releaseNames.map((releaseName) => {
    const progress = releaseProgress.get(releaseName) || {
      total: 0,
      completed: 0,
      development_total: 0,
      development_completed: 0,
      support_total: 0,
      support_completed: 0,
    };
    const completionRatio = progress.total ? Math.round((progress.completed / progress.total) * 1000) / 10 : 0;
    const developmentCompletionRatio = progress.development_total
      ? Math.round((progress.development_completed / progress.development_total) * 1000) / 10
      : 0;
    const supportCompletionRatio = progress.support_total
      ? Math.round((progress.support_completed / progress.support_total) * 1000) / 10
      : 0;
    const supportShare = progress.support_total ? RELEASE_SUPPORT_CAP : 0;
    const effectiveCompletionRatio = Math.round(
      ((developmentCompletionRatio * ((100 - supportShare) / 100)) + (supportCompletionRatio * (supportShare / 100))) * 10,
    ) / 10;
    const rawWeight = Number(normalizedSettings.release_weights?.[releaseName] || 0);
    const normalizedWeightShare = totalReleaseWeightPoints > 0
      ? rawWeight / totalReleaseWeightPoints
      : releaseNames.length
        ? 1 / releaseNames.length
        : 0;
    weightedReleaseCompletionRatio += effectiveCompletionRatio * normalizedWeightShare;
    return {
      name: releaseName,
      total: progress.total,
      completed: progress.completed,
      completion_ratio: completionRatio,
      effective_completion_ratio: effectiveCompletionRatio,
      development_total: progress.development_total,
      development_completed: progress.development_completed,
      development_completion_ratio: developmentCompletionRatio,
      support_total: progress.support_total,
      support_completed: progress.support_completed,
      support_completion_ratio: supportCompletionRatio,
      support_cap: RELEASE_SUPPORT_CAP,
      weight: Math.round(rawWeight * 100) / 100,
      normalized_weight: Math.round(normalizedWeightShare * 1000) / 10,
    };
  });
  weightedReleaseCompletionRatio = Math.round(weightedReleaseCompletionRatio * 10) / 10;
  let weightedCompletionRatio = 0;
  if (releaseTotal && nonReleaseTotal) {
    weightedCompletionRatio = Math.round(((weightedReleaseCompletionRatio * releaseWeight) + (nonReleaseCompletionRatio * (1 - releaseWeight))) * 10) / 10;
  } else if (releaseTotal) {
    weightedCompletionRatio = weightedReleaseCompletionRatio;
  } else if (nonReleaseTotal) {
    weightedCompletionRatio = nonReleaseCompletionRatio;
  }

  return {
    ...counters,
    completion_ratio: counters.total ? Math.round((counters.completed / counters.total) * 1000) / 10 : 0,
    weighted_completion_ratio: weightedCompletionRatio,
    release_completion_ratio: releaseCompletionRatio,
    weighted_release_completion_ratio: weightedReleaseCompletionRatio,
    non_release_completion_ratio: nonReleaseCompletionRatio,
    release_total: releaseTotal,
    non_release_total: nonReleaseTotal,
    release_weight: normalizedSettings.release_weight,
    release_breakdown: releaseBreakdown,
    top_releases: [...releaseCounts.entries()].sort((left, right) => right[1] - left[1]).slice(0, 5),
    top_assignees: [...assigneeCounts.entries()].sort((left, right) => right[1] - left[1]).slice(0, 6),
  };
}

function percentOf(part, total) {
  if (!total) return 0;
  return Math.round((part / total) * 1000) / 10;
}

function projectKeyPrefix() {
  const prefixes = new Map();
  for (const task of state.editDraft) {
    const key = String(task.key || "").trim();
    const prefix = key.includes("-") ? key.split("-")[0] : "";
    if (!prefix) continue;
    prefixes.set(prefix, (prefixes.get(prefix) || 0) + 1);
  }
  if (prefixes.size) {
    return [...prefixes.entries()].sort((left, right) => right[1] - left[1])[0][0];
  }
  const fallback = String(state.project?.project || "PLAN")
    .toUpperCase()
    .replace(/[^A-Z0-9 ]+/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part[0])
    .join("")
    .slice(0, 6);
  return fallback || "PLAN";
}

function nextManualTaskKey() {
  const prefix = projectKeyPrefix();
  const existing = new Set(state.editDraft.map((task) => String(task.key || "").trim().toUpperCase()));
  let counter = 1;
  while (counter < 10000) {
    const candidate = `${prefix}-MAN-${String(counter).padStart(3, "0")}`;
    if (!existing.has(candidate.toUpperCase())) {
      return candidate;
    }
    counter += 1;
  }
  return `${prefix}-MAN-${Date.now()}`;
}

function nextInsertedLine() {
  const minLine = state.editDraft.reduce((min, task) => Math.min(min, Number(task.line) || min), Number.POSITIVE_INFINITY);
  if (Number.isFinite(minLine) && minLine > -1000000) {
    return minLine - 1;
  }
  return 4;
}

function statusSegments(metrics = {}) {
  return [
    { key: "completed", label: "Concluido", value: metrics.completed || 0 },
    { key: "active", label: "Em curso", value: metrics.active || 0 },
    { key: "upcoming", label: "Proximas", value: metrics.upcoming || 0 },
    { key: "due_soon", label: "Prazo proximo", value: metrics.due_soon || 0 },
    { key: "overdue", label: "Em atraso", value: metrics.overdue || 0 },
  ];
}

function firstActiveTaskByStatus(statusKey) {
  return state.editDraft
    .filter((task) => task.bucket === "active" && normalizedStatusKey(task.status) === statusKey)
    .sort((left, right) => (left.end || "9999-12-31").localeCompare(right.end || "9999-12-31"))[0];
}

function renderTaskNotesEditor(task, index) {
  const noteWarning = taskNeedsDateNote(task);
  const hint = noteWarning
    ? "Data alterada: recomenda-se registar a justificacao antes de exportar."
    : (String(task.notes || "").trim() ? "Nota guardada neste item." : "Sem nota registada.");
  return `
    <textarea
      data-index="${index}"
      name="notes"
      rows="3"
      class="issue-note-input ${noteWarning ? "is-warning" : ""}"
      placeholder="${escapeHtml(taskNotePlaceholder(task))}"
    >${escapeHtml(task.notes || "")}</textarea>
    <small class="issue-note-hint ${noteWarning ? "is-warning" : ""}">${escapeHtml(hint)}</small>`;
}

function isNotesTarget(target) {
  return target instanceof HTMLTextAreaElement && target.name === "notes" && Boolean(target.dataset.index);
}

function activeNotesEditor() {
  return isNotesTarget(document.activeElement) ? document.activeElement : null;
}

function updateNoteEditorFeedback(target) {
  if (!isNotesTarget(target)) return;
  const index = Number(target.dataset.index);
  const task = state.editDraft[index];
  if (!task) return;
  const noteWarning = taskNeedsDateNote(task);
  target.classList.toggle("is-warning", noteWarning);
  target.placeholder = taskNotePlaceholder(task);
  const hint = target.parentElement?.querySelector(".issue-note-hint");
  if (hint instanceof HTMLElement) {
    hint.classList.toggle("is-warning", noteWarning);
    hint.textContent = noteWarning
      ? "Data alterada: recomenda-se registar a justificacao antes de exportar."
      : (String(task.notes || "").trim() ? "Nota guardada neste item." : "Sem nota registada.");
  }
}

function currentStatusOptions() {
  const options = new Set(STATUS_LIBRARY);
  for (const task of state.editDraft) {
    if (task.status) options.add(task.status);
  }
  return [...options];
}

function indexedTasks(filterFn) {
  return state.editDraft
    .map((task, index) => ({ task, index }))
    .filter(({ task }) => filterFn(task))
    .sort((left, right) => (left.task.end || "9999-12-31").localeCompare(right.task.end || "9999-12-31"));
}

function renderProjects() {
  if (!state.currentUser) {
    els.projectSelect.innerHTML = `<option value="">Inicia sessao para aceder aos projetos</option>`;
    return;
  }
  const remembered = window.localStorage.getItem(STORAGE_KEYS.project) || "";
  const options = state.projects
    .map((project) => `<option value="${escapeHtml(project.slug)}">${escapeHtml(project.project || project.slug)} - ${escapeHtml(project.source_type || "")}</option>`)
    .join("");

  els.projectSelect.innerHTML = options || `<option value="">Sem projetos importados</option>`;

  if (state.project?.slug) {
    els.projectSelect.value = state.project.slug;
  } else if (remembered && state.projects.some((project) => project.slug === remembered)) {
    els.projectSelect.value = remembered;
  }
}

function renderPageHeader() {
  const config = PAGE_CONFIG[state.currentPage] || PAGE_CONFIG.dashboard;
  els.pageKicker.textContent = config.kicker;
  els.pageTitle.textContent = config.title;
}

function renderConnectionNotice(message = "") {
  if (!message) {
    els.connectionNotice.textContent = "";
    els.connectionNotice.classList.add("hidden");
    return;
  }
  els.connectionNotice.textContent = message;
  els.connectionNotice.classList.remove("hidden");
}

function renderSaveState() {
  const label =
    state.saveState === "saving"
      ? "A guardar..."
      : state.saveState === "saved"
        ? `Guardado as ${lastSavedLabel(state.project)}`
        : state.saveState === "error"
          ? "Falha ao guardar"
          : state.isDirty
            ? "Alteracoes por guardar"
            : "Sem alteracoes";

  els.saveStateBadge.textContent = label;
  els.saveStateBadge.classList.toggle("is-saving", state.saveState === "saving");
  els.saveStateBadge.classList.toggle("is-saved", state.saveState === "saved" && !state.isDirty);
  els.saveStateBadge.classList.toggle("is-error", state.saveState === "error");
}

function setCurrentPage(page, syncHash = true) {
  if (!PAGE_CONFIG[page]) return;
  const safePage = page === "setup" && !isAdmin() ? "dashboard" : page;
  state.currentPage = safePage;
  window.localStorage.setItem(STORAGE_KEYS.page, safePage);
  els.navLinks.forEach((button) => button.classList.toggle("active", button.dataset.page === safePage));
  els.pageSections.forEach((section) => section.classList.toggle("active", section.id === `page-${safePage}`));
  renderPageHeader();
  if (syncHash) {
    window.location.hash = safePage;
  }
}

function renderProjectMeta() {
  if (!state.currentUser) {
    els.projectMeta.textContent = "Inicia sessao para abrir os projetos e continuar a trabalhar.";
    els.sidebarProjectName.textContent = "Acesso protegido";
    els.sidebarProjectMeta.textContent = "A aplicacao requer autenticacao antes de carregar qualquer informacao.";
    renderSaveState();
    return;
  }
  if (!state.project) {
    els.projectMeta.textContent = "Sem projeto carregado. Usa a configuracao para importar um planeamento.";
    els.sidebarProjectName.textContent = "Sem projeto carregado";
    els.sidebarProjectMeta.textContent = "Importa um Excel ou CSV para comecar.";
    renderSaveState();
    return;
  }

  const updatedAt = state.project.updated_at || state.project.imported_at;
  const dirtyText = state.isDirty ? " - alteracoes por guardar" : "";
  els.projectMeta.textContent = `${state.project.project}${dirtyText}`;
  els.sidebarProjectName.textContent = state.project.project;
  els.sidebarProjectMeta.textContent = `${state.project.tasks.length} tarefas no plano. ${state.isDirty ? "Existem alteracoes por guardar." : "Plano guardado e pronto para reporting."}`;
  renderSaveState();
}

function renderSidebarOverview(metrics = {}) {
  if (!state.project) {
    els.sidebarOverviewTitle.textContent = "Cockpit por carregar";
    els.sidebarOverviewBadge.textContent = "0%";
    els.sidebarMiniRing.style.setProperty("--progress", "0%");
    els.sidebarMiniRing.innerHTML = `
      <div class="sidebar-mini-ring-inner">
        <strong>0%</strong>
        <span>Global</span>
      </div>`;
    els.sidebarMiniStats.innerHTML = `
      <div class="sidebar-mini-stat">
        <span>Releases</span>
        <strong>0%</strong>
      </div>
      <div class="sidebar-mini-stat">
        <span>In Progress</span>
        <strong>0</strong>
      </div>
      <div class="sidebar-mini-stat">
        <span>Open</span>
        <strong>0</strong>
      </div>
      <div class="sidebar-mini-stat">
        <span>Risco</span>
        <strong>0</strong>
      </div>`;
    els.sidebarMiniBars.innerHTML = `
      <div class="sidebar-mini-stack">
        <div class="sidebar-mini-segment upcoming" style="width:100%"></div>
      </div>
      <p class="sidebar-mini-caption">Importa um plano para ativar a leitura executiva.</p>`;
    return;
  }

  const total = Math.max(metrics.total || 0, 1);
  const alertCount = (metrics.overdue || 0) + (metrics.due_soon || 0);
  const releaseScore = metrics.weighted_release_completion_ratio ?? metrics.release_completion_ratio ?? 0;
  const completion = metrics.weighted_completion_ratio || 0;
  const segments = statusSegments(metrics);

  els.sidebarOverviewTitle.textContent = state.project.project;
  els.sidebarOverviewBadge.textContent = `${completion}%`;
  els.sidebarMiniRing.style.setProperty("--progress", `${completion}%`);
  els.sidebarMiniRing.innerHTML = `
    <div class="sidebar-mini-ring-inner">
      <strong>${escapeHtml(String(completion))}%</strong>
      <span>Global</span>
    </div>`;
  els.sidebarMiniStats.innerHTML = `
    <div class="sidebar-mini-stat">
      <span>Releases</span>
      <strong>${escapeHtml(String(releaseScore))}%</strong>
    </div>
    <div class="sidebar-mini-stat">
      <span>In Progress</span>
      <strong>${escapeHtml(String(metrics.active_in_progress || 0))}</strong>
    </div>
    <div class="sidebar-mini-stat">
      <span>Open</span>
      <strong>${escapeHtml(String(metrics.active_open || 0))}</strong>
    </div>
    <div class="sidebar-mini-stat">
      <span>Risco</span>
      <strong>${escapeHtml(String(alertCount))}</strong>
    </div>`;
  els.sidebarMiniBars.innerHTML = `
    <div class="sidebar-mini-stack">
      ${segments
        .filter((segment) => segment.value > 0)
        .map(
          (segment) => `
            <div class="sidebar-mini-segment ${segment.key}" style="width:${Math.max(percentOf(segment.value, total), 3)}%"></div>`,
        )
        .join("")}
    </div>
    <p class="sidebar-mini-caption">
      ${escapeHtml(String(metrics.completed || 0))} concluidas - ${escapeHtml(String(metrics.active_in_progress || 0))} em execucao - ${escapeHtml(String(metrics.active_open || 0))} em open - ${escapeHtml(String(alertCount))} em risco
    </p>`;
}

function renderExecutiveStripCompact(metrics = {}) {
  if (!state.project) {
    els.executiveStrip.innerHTML = `
      <article class="executive-stat-card">
        <span>Progresso global</span>
        <strong>0%</strong>
        <small>Sem projeto carregado.</small>
      </article>
      <article class="executive-stat-card">
        <span>Releases dev</span>
        <strong>0</strong>
        <small>Importa um planeamento para comecar.</small>
      </article>
      <article class="executive-stat-card">
        <span>Alertas</span>
        <strong>0</strong>
        <small>Sem deadlines imediatos.</small>
      </article>
      <article class="executive-stat-card">
        <span>Owner critico</span>
        <strong>n/d</strong>
        <small>Ainda sem distribuicao de carga.</small>
      </article>`;
    return;
  }

  const alertCount = (metrics.overdue || 0) + (metrics.due_soon || 0);
  const topOwner = metrics.top_assignees?.[0];
  const inProgressLead = firstActiveTaskByStatus("in progress");
  const openLead = firstActiveTaskByStatus("open");
  const current = inProgressLead || openLead || state.editDraft
    .filter((task) => task.bucket === "active" && task.end)
    .sort((left, right) => left.end.localeCompare(right.end))[0];
  const upcoming = state.editDraft
    .filter((task) => task.bucket === "upcoming" && task.start)
    .sort((left, right) => left.start.localeCompare(right.start))[0];

  els.executiveStrip.innerHTML = `
    <article class="executive-stat-card">
      <span>Progresso global</span>
      <strong>${escapeHtml(String(metrics.weighted_completion_ratio || 0))}%</strong>
      <small>Leitura consolidada do projeto.</small>
    </article>
    <article class="executive-stat-card">
      <span>Agora</span>
      <div class="execution-balance">
        <div class="execution-balance-item">
          <strong>${escapeHtml(String(metrics.active_in_progress || 0))}</strong>
          <small>In Progress</small>
        </div>
        <div class="execution-balance-item is-open">
          <strong>${escapeHtml(String(metrics.active_open || 0))}</strong>
          <small>Open</small>
        </div>
      </div>
      <small>${escapeHtml(current ? `${current.title} · prazo ${formatDate(current.end)}` : `${metrics.active || 0} acoes em execucao`)}</small>
    </article>
    <article class="executive-stat-card ${alertCount ? "is-alert" : ""}">
      <span>Em risco</span>
      <strong>${escapeHtml(String(alertCount))}</strong>
      <small>${alertCount ? "Deadlines em risco ou proximos." : "Sem alertas criticos neste momento."}</small>
    </article>
    <article class="executive-stat-card">
      <span>Proxima a iniciar</span>
      <strong>${escapeHtml(upcoming?.key || topOwner?.[0] || "n/d")}</strong>
      <small>${escapeHtml(upcoming ? `${upcoming.title} · ${formatDate(upcoming.start)}` : topOwner ? `${topOwner[0]} com maior carga no plano` : "Sem marco futuro identificado.")}</small>
    </article>`;
}

function renderStatusOverview(metrics = {}) {
  if (!state.project) {
    els.statusOverview.innerHTML = `<p class="muted">Carrega um projeto para visualizar a distribuicao executiva do plano.</p>`;
    return;
  }

  const total = Math.max(metrics.total || 0, 1);
  const segments = statusSegments(metrics);

  els.statusOverview.innerHTML = `
    <div class="status-stack">
      ${segments
        .filter((segment) => segment.value > 0)
        .map(
          (segment) => `
            <div class="status-segment ${segment.key}" style="width:${Math.max(percentOf(segment.value, total), 3)}%">
              <span>${segment.label}</span>
            </div>`,
        )
        .join("")}
    </div>
    <div class="status-legend">
      ${segments
        .map(
          (segment) => `
            <div class="status-legend-row">
              <div class="status-legend-label">
                <span class="status-dot ${segment.key}"></span>
                <strong>${segment.label}</strong>
              </div>
              <span>${escapeHtml(String(segment.value))} items</span>
              <span>${escapeHtml(String(percentOf(segment.value, total)))}%</span>
            </div>`,
        )
        .join("")}
    </div>`;
}

function renderExecutivePulse(metrics = {}) {
  if (!state.project) {
    els.executivePulse.innerHTML = `<p class="muted">Os indicadores visuais aparecem assim que existir um projeto carregado.</p>`;
    return;
  }

  const alertRatio = Math.min(100, percentOf((metrics.overdue || 0) + (metrics.due_soon || 0), metrics.total || 0));
  const cards = [
    {
      label: "Global",
      value: metrics.weighted_completion_ratio || 0,
      note: "Progresso consolidado",
      tone: "global",
    },
    {
      label: "Releases",
      value: metrics.weighted_release_completion_ratio ?? metrics.release_completion_ratio ?? 0,
      note: "Saude efetiva das releases",
      tone: "release",
    },
    {
      label: "Alertas",
      value: alertRatio,
      note: `${(metrics.overdue || 0) + (metrics.due_soon || 0)} items a acompanhar`,
      tone: "alert",
    },
  ];

  els.executivePulse.innerHTML = `
    <div class="executive-pulse-grid">
      ${cards
        .map(
          (card) => `
            <article class="pulse-card">
              <div class="mini-ring ${card.tone}" style="--progress:${card.value}%">
                <div class="mini-ring-inner">
                  <strong>${escapeHtml(String(card.value))}%</strong>
                  <span>${card.label}</span>
                </div>
              </div>
              <small>${card.note}</small>
            </article>`,
        )
        .join("")}
    </div>`;
}

function renderKpis(metrics = {}) {
  const cards = [
    ["Plano", metrics.total || 0, "base atual"],
    ["Releases", metrics.release_total || 0, "dev"],
    ["Alertas", (metrics.overdue || 0) + (metrics.due_soon || 0), "prazos"],
    ["Em curso", metrics.active || 0, "agora"],
    ["Score release", `${(metrics.weighted_release_completion_ratio ?? metrics.release_completion_ratio ?? 0)}%`, "ponderado"],
    ["Global", `${metrics.weighted_completion_ratio || 0}%`, "executivo"],
  ];

  els.kpiGrid.innerHTML = cards
    .map(
      ([label, value, note]) => `
        <article class="kpi-card compact">
          <span>${label}</span>
          <strong>${value}</strong>
          <small>${note}</small>
        </article>`,
    )
    .join("");
}

function renderDashboardSummaryCardsCompact(metrics = {}) {
  if (!state.project) {
    els.dashboardSummaryCards.innerHTML = `
      <div class="overview-feature">
        <span>Agora</span>
        <strong>Leitura do trabalho em execucao</strong>
      </div>
      <div class="overview-feature">
        <span>Risco</span>
        <strong>Deadlines e pontos de atencao</strong>
      </div>
      <div class="overview-feature">
        <span>Seguinte</span>
        <strong>Proximas acoes e proximos marcos</strong>
      </div>`;
    return;
  }

  const criticalCount = (metrics.overdue || 0) + (metrics.due_soon || 0);
  const inProgressLead = firstActiveTaskByStatus("in progress");
  const openLead = firstActiveTaskByStatus("open");
  const nextTask = state.editDraft
    .filter((task) => task.bucket === "upcoming" && task.start)
    .sort((left, right) => left.start.localeCompare(right.start))[0];
  const current = {
    key: `${metrics.active_in_progress || 0} em In Progress | ${metrics.active_open || 0} em Open`,
    title: openLead ? `${openLead.key} em open` : inProgressLead ? inProgressLead.key : "execucao ativa",
  };
  els.dashboardSummaryCards.innerHTML = `
    <div class="overview-feature">
      <span>Agora</span>
      <strong>${escapeHtml(current ? `${current.key} · ${current.title}` : `${metrics.active || 0} acoes em execucao`)}</strong>
    </div>
    <div class="overview-feature">
      <span>Risco</span>
      <strong>${escapeHtml(String(criticalCount))} itens exigem acompanhamento imediato</strong>
    </div>
    <div class="overview-feature">
      <span>Seguinte</span>
      <strong>${escapeHtml(nextTask ? `${nextTask.key} · ${nextTask.title}` : "Sem proxima acao identificada")}</strong>
    </div>`;
}

function renderWorkspaceHero(metrics = {}) {
  if (!state.project) {
    els.heroHeading.textContent = "Cockpit profissional para acompanhar entregas, releases e execucao.";
    els.heroDescription.textContent =
      "Importa um Excel de referencia ou um CSV do Jira Planner, edita diretamente o plano e mantem uma versao pronta para exportacao executiva.";
    els.heroMetrics.innerHTML = `
      <article class="hero-metric-card">
        <span>Entrada</span>
        <strong>Excel ou CSV Jira</strong>
        <small>Importacao pensada para reutilizacao noutros projetos.</small>
      </article>
      <article class="hero-metric-card">
        <span>Operacao</span>
        <strong>Edicao simples e centralizada</strong>
        <small>Datas, estados, responsaveis, parents e releases num unico workspace.</small>
      </article>
      <article class="hero-metric-card">
        <span>Saida</span>
        <strong>Excel Gantt pronto a partilhar</strong>
        <small>A exportacao respeita sempre o formato de referencia do teu planeamento.</small>
      </article>`;
    els.spotlightTitle.textContent = "Pronto para importar um plano";
    els.spotlightProgress.style.setProperty("--progress", "0%");
    els.spotlightProgressValue.textContent = "0%";
    els.spotlightMeta.innerHTML = `
      <div class="spotlight-stat"><span>Estado</span><strong>Sem projeto carregado</strong></div>
      <div class="spotlight-stat"><span>Modelo</span><strong>Reutilizavel para varios projetos</strong></div>
      <div class="spotlight-stat"><span>Formato</span><strong>Excel Gantt + alertas</strong></div>`;
    return;
  }

  const updatedAt = state.project.updated_at || state.project.imported_at;
  const updatedLabel = updatedAt ? new Date(updatedAt).toLocaleDateString("pt-PT") : "n/d";
  const weightedCompletion = Number(metrics.weighted_completion_ratio || metrics.completion_ratio || 0);
  const releaseWeight = normalizeProjectSettings(state.settingsDraft).release_weight;
  const developmentReleaseCount = metrics.release_breakdown?.length || 0;
  const criticalCount = (metrics.overdue || 0) + (metrics.due_soon || 0);

  els.heroHeading.textContent = `${state.project.project} sob controlo numa vista unica de gestao.`;
  els.heroDescription.textContent =
    "Acompanha o estado executivo, prioriza acoes, confirma parents e releases, ajusta datas com rapidez e mantem o ficheiro de saida sempre pronto para reporting.";
  els.heroMetrics.innerHTML = `
    <article class="hero-metric-card">
      <span>Projeto ativo</span>
      <strong>${escapeHtml(state.project.project)}</strong>
      <small>Origem ${escapeHtml(String(state.project.source_type || "").toUpperCase())} | Atualizado em ${escapeHtml(updatedLabel)}</small>
    </article>
    <article class="hero-metric-card">
      <span>Execucao</span>
      <strong>${escapeHtml(String(metrics.active || 0))} acoes em curso</strong>
      <small>${escapeHtml(String(metrics.upcoming || 0))} a iniciar | ${escapeHtml(String(metrics.completed || 0))} concluidas</small>
    </article>
    <article class="hero-metric-card">
      <span>Governance</span>
      <strong>${escapeHtml(String(developmentReleaseCount))} releases dev com peso proprio</strong>
      <small>O bloco releases pesa ${escapeHtml(String(releaseWeight))}% do projeto e cada release considera no maximo 10% para teste, bugfix e re-teste.</small>
    </article>`;
  els.spotlightTitle.textContent =
    criticalCount > 0
      ? `${criticalCount} prazos a acompanhar de perto`
      : `${developmentReleaseCount} releases de desenvolvimento mapeadas`;
  els.spotlightProgress.style.setProperty("--progress", `${weightedCompletion}%`);
  els.spotlightProgressValue.textContent = `${weightedCompletion}%`;
  els.spotlightMeta.innerHTML = `
    <div class="spotlight-stat"><span>Progresso releases</span><strong>${escapeHtml(String(metrics.weighted_release_completion_ratio ?? metrics.release_completion_ratio ?? 0))}%</strong></div>
    <div class="spotlight-stat"><span>Progresso restante</span><strong>${escapeHtml(String(metrics.non_release_completion_ratio || 0))}%</strong></div>
    <div class="spotlight-stat"><span>Em risco</span><strong>${escapeHtml(String(criticalCount))} items</strong></div>`;
}

function renderReleaseBars(releases = []) {
  if (!releases.length) {
    els.releaseSummary.innerHTML = `<p class="muted">Sem releases de desenvolvimento identificadas.</p>`;
    return;
  }

  const prioritizedReleases = [...releases]
    .sort((left, right) => (right.normalized_weight || 0) - (left.normalized_weight || 0))
    .slice(0, 4);

  els.releaseSummary.innerHTML = prioritizedReleases
    .map(
      (release) => `
        <article class="release-health-card">
          <div class="release-health-head">
            <strong>${escapeHtml(release.name)}</strong>
            <span>${escapeHtml(String(release.normalized_weight))}% do bloco releases</span>
          </div>
          <div class="release-health-inline">
            <div>
              <small>Efetivo</small>
              <strong>${escapeHtml(String(release.effective_completion_ratio || 0))}%</strong>
            </div>
            <div>
              <small>Desenv.</small>
              <strong>${escapeHtml(String(release.development_completion_ratio || 0))}%</strong>
            </div>
            <div>
              <small>Suporte</small>
              <strong>${escapeHtml(String(release.support_completion_ratio || 0))}%</strong>
            </div>
          </div>
          <div class="release-meter">
            <span>Progresso efetivo | ${escapeHtml(String(release.development_total || 0))} dev | ${escapeHtml(String(release.support_total || 0))} suporte</span>
            <div class="progress-meter">
              <div class="progress-fill effective" style="width:${release.effective_completion_ratio || 0}%"></div>
            </div>
          </div>
        </article>`,
    )
    .join("");

  if (releases.length > prioritizedReleases.length) {
    els.releaseSummary.insertAdjacentHTML(
      "beforeend",
      `<p class="list-truncation-note">+ ${escapeHtml(String(releases.length - prioritizedReleases.length))} releases adicionais disponiveis nas restantes vistas.</p>`,
    );
  }
}

function renderAssigneeSummary(metrics = {}) {
  const fullAssignees = metrics.top_assignees || [];
  const assignees = fullAssignees.slice(0, 4);
  if (!assignees.length) {
    els.assigneeSummary.innerHTML = `<p class="muted">Sem responsaveis atribuidos para destacar.</p>`;
    return;
  }

  const max = Math.max(...assignees.map(([, count]) => count), 1);
  els.assigneeSummary.innerHTML = assignees
    .map(
      ([assignee, count]) => `
        <div class="assignee-row">
          <div class="assignee-label">
            <strong>${escapeHtml(assignee)}</strong>
            <span>${escapeHtml(String(count))} items no plano</span>
          </div>
          <div class="progress-meter">
            <div class="progress-fill owner" style="width:${(count / max) * 100}%"></div>
          </div>
        </div>`,
    )
    .join("");

  if (fullAssignees.length > assignees.length) {
    els.assigneeSummary.insertAdjacentHTML(
      "beforeend",
      `<p class="list-truncation-note">+ ${escapeHtml(String(fullAssignees.length - assignees.length))} responsaveis adicionais fora desta leitura rapida.</p>`,
    );
  }
}

function renderProjectOptions(metrics = null) {
  const releaseNames = releaseNamesFromTasks(state.editDraft);
  const settings = normalizeProjectSettings(state.settingsDraft, releaseNames);
  state.settingsDraft = settings;
  els.releaseWeightRange.value = String(settings.release_weight);
  els.releaseWeightNumber.value = String(settings.release_weight);
  els.weightSummary.textContent = `As releases de desenvolvimento valem ${settings.release_weight}% do progresso global. O restante projeto vale ${100 - settings.release_weight}%. Em cada release, testes, bugfixing e re-teste contam no maximo 10%.`;

  if (!releaseNames.length) {
    els.releaseWeightsEditor.innerHTML = `<p class="muted">Nao existem releases de desenvolvimento identificadas no projeto atual.</p>`;
    els.releaseWeightsSummary.textContent = "Quando forem identificadas releases de desenvolvimento, poderas atribuir pesos relativos a cada uma.";
  } else {
    const breakdown = metrics?.release_breakdown || releaseNames.map((name) => ({ name, total: 0, completion_ratio: 0, normalized_weight: 0 }));
    const totalWeight = Object.values(settings.release_weights || {}).reduce((sum, value) => sum + Number(value || 0), 0);
    els.releaseWeightsEditor.innerHTML = breakdown
      .map(
        (release) => `
          <article class="release-weight-card">
            <div class="release-weight-head">
              <strong>${escapeHtml(release.name)}</strong>
              <span>${escapeHtml(String(release.development_completion_ratio || 0))}% desenvolvimento | ${escapeHtml(String(release.support_completion_ratio || 0))}% suporte | ${escapeHtml(String(release.normalized_weight || 0))}% do bloco releases</span>
            </div>
            <label>
              <span>Peso relativo desta release</span>
              <input data-release-weight="${escapeHtml(release.name)}" type="number" min="0" step="0.5" value="${escapeHtml(String(settings.release_weights?.[release.name] ?? 0))}" />
            </label>
          </article>`,
      )
      .join("");
    els.releaseWeightsSummary.innerHTML = `<span class="weight-total-pill">Soma atual: ${escapeHtml(String(Math.round(totalWeight * 100) / 100))}</span> O sistema normaliza automaticamente estes pesos dentro do bloco releases de desenvolvimento e limita teste, bugfix e re-teste a ${RELEASE_SUPPORT_CAP}% por release.`;
  }

  const disabled = !state.project || !isAdmin();
  for (const element of [els.releaseWeightRange, els.releaseWeightNumber, ...els.projectOptionsForm.querySelectorAll("button, input")]) {
    element.disabled = disabled;
  }
}

function renderDashboardDeadlines() {
  if (!state.project) {
    els.dashboardWelcomeText.textContent = "Escolhe ou importa um projeto para visualizar o estado atual, o risco e a proxima vaga de trabalho.";
    els.dashboardDeadlines.innerHTML = `<p class="muted">Ainda nao existe nenhum projeto carregado.</p>`;
    return;
  }

  const allDeadlines = indexedTasks((task) => task.bucket === "overdue" || task.bucket === "due_soon" || task.bucket === "active");
  const deadlines = allDeadlines.slice(0, 4);
  els.dashboardWelcomeText.textContent = `Projeto atual: ${state.project.project}.`;

  if (!deadlines.length) {
    els.dashboardDeadlines.innerHTML = `<p class="muted">Nao existem prazos imediatos identificados.</p>`;
    return;
  }

  els.dashboardDeadlines.innerHTML = deadlines
    .map(
      ({ task }) => `
        <article class="deadline-item">
          <div class="deadline-item-head">
            <strong>${escapeHtml(task.key)}</strong>
            <span class="pill ${escapeHtml(task.bucket)}">${escapeHtml(task.status)}</span>
          </div>
          <p class="deadline-item-title">${escapeHtml(task.title)}</p>
          <div class="issue-meta-row">
            <span class="meta-chip parent-chip">Parent: ${escapeHtml(task.parent || "Sem parent")}</span>
            <span class="meta-chip release-chip">Release dev: ${escapeHtml(task.release || "Nao classificada")}</span>
          </div>
          <p>Responsavel: ${escapeHtml(task.assignee || "n/d")} | Deadline: ${escapeHtml(formatDate(task.end))}</p>
        </article>`,
    )
    .join("");

  if (allDeadlines.length > deadlines.length) {
    els.dashboardDeadlines.insertAdjacentHTML(
      "beforeend",
      `<p class="list-truncation-note">+ ${escapeHtml(String(allDeadlines.length - deadlines.length))} itens adicionais nas vistas operacionais.</p>`,
    );
  }
}

function aiContextCard(label, value, detail) {
  return `
    <article class="ai-context-card">
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(value)}</strong>
      <small>${escapeHtml(detail)}</small>
    </article>`;
}

function renderAiMessages() {
  if (!els.aiMessages) return;
  els.aiMessages.innerHTML = state.aiMessages
    .map(
      (message) => `
        <article class="ai-message ${escapeHtml(message.role)}">
          <div class="ai-message-meta">${message.role === "user" ? "Tu" : "Workspace"}</div>
          <div class="ai-message-body">${escapeHtml(message.content).replaceAll("\n", "<br />")}</div>
        </article>`,
    )
    .join("");
  els.aiMessages.scrollTop = els.aiMessages.scrollHeight;
}

function normalizeAiMessages(messages = []) {
  const normalized = (messages || [])
    .filter((message) => message && (message.role === "user" || message.role === "assistant") && String(message.content || "").trim())
    .map((message) => ({
      role: message.role,
      content: String(message.content || "").trim(),
    }))
    .slice(-80);
  return normalized.length ? normalized : [...DEFAULT_WORKSPACE_MESSAGES];
}

function renderGeneratedAiFiles() {
  if (!els.aiGeneratedFiles) return;
  if (!state.generatedAiFiles.length) {
    els.aiGeneratedFiles.innerHTML = `<p class="muted">Ainda nao existem ficheiros gerados nesta sessao.</p>`;
    return;
  }

  els.aiGeneratedFiles.innerHTML = state.generatedAiFiles
    .map(
      (item) => `
        <a class="generated-file-link" href="${escapeHtml(apiUrl(item.file))}" target="_blank" rel="noopener">
          <strong>${escapeHtml(item.name)}</strong>
          <span>${escapeHtml(item.label || "Ficheiro gerado")}</span>
        </a>`,
    )
    .join("");
}

function renderAiContextSummary() {
  if (!els.aiContextSummary) return;
  els.aiModelLabel.textContent = state.aiConfig?.model || "gpt-5.4";
  els.aiTemplateLabel.textContent = state.aiConfig?.steering_template_path
    ? `Template steering: ${state.aiConfig.steering_template_path}`
    : "Template steering nao configurado.";

  if (!state.project) {
    els.aiContextSummary.innerHTML = `
      ${aiContextCard("Projeto", "Sem projeto", "Carrega um projeto para dar contexto ao GPT")}
      ${aiContextCard("Workspace", "Executivo", "Respostas em linguagem de steering e project management")}
      ${aiContextCard("PowerPoint", "Pronto", "Pode gerar steering PPTX quando existir um projeto ativo")}`;
    return;
  }

  const metrics = deriveMetrics(state.editDraft, state.settingsDraft);
  const critical = (metrics.overdue || 0) + (metrics.due_soon || 0);
  els.aiContextSummary.innerHTML = `
    ${aiContextCard("Projeto", state.project.project || "n/d", `${state.editDraft.length} itens no plano atual`)}
    ${aiContextCard("Progresso", `${metrics.weighted_completion_ratio || 0}%`, "Leitura global ponderada")}
    ${aiContextCard("Em risco", String(critical), `${metrics.overdue || 0} atrasados | ${metrics.due_soon || 0} proximos`)}
    ${aiContextCard("Agora", String(metrics.active || 0), "Itens em execucao que o GPT pode resumir")}`;
}

function renderAiWorkspace() {
  renderAiMessages();
  renderAiContextSummary();
  renderGeneratedAiFiles();
  const disabled = state.aiBusy || !state.currentUser;
  for (const element of [els.downloadLastReply, els.generateSteering, els.generateSteeringSecondary]) {
    if (element) element.disabled = disabled;
  }
  if (els.aiPrompt) {
    els.aiPrompt.disabled = disabled;
  }
}

function renderExecutiveStrip(metrics = {}) {
  if (!state.project) {
    els.executiveStrip.innerHTML = `
      <article class="executive-stat-card">
        <span>Progresso global</span>
        <strong>0%</strong>
        <small>Sem projeto carregado.</small>
      </article>
      <article class="executive-stat-card">
        <span>Releases dev</span>
        <strong>0</strong>
        <small>Importa um planeamento para comecar.</small>
      </article>
      <article class="executive-stat-card">
        <span>Alertas</span>
        <strong>0</strong>
        <small>Sem deadlines imediatos.</small>
      </article>
      <article class="executive-stat-card">
        <span>Owner critico</span>
        <strong>n/d</strong>
        <small>Ainda sem distribuicao de carga.</small>
      </article>`;
    return;
  }

  const alertCount = (metrics.overdue || 0) + (metrics.due_soon || 0);
  const topOwner = metrics.top_assignees?.[0];
  const current = state.editDraft
    .filter((task) => task.bucket === "active" && task.end)
    .sort((left, right) => left.end.localeCompare(right.end))[0];
  const upcoming = state.editDraft
    .filter((task) => task.bucket === "upcoming" && task.start)
    .sort((left, right) => left.start.localeCompare(right.start))[0];

  els.executiveStrip.innerHTML = `
    <article class="executive-stat-card">
      <span>Progresso global</span>
      <strong>${escapeHtml(String(metrics.weighted_completion_ratio || 0))}%</strong>
      <small>Score consolidado para steering.</small>
    </article>
    <article class="executive-stat-card">
      <span>Em curso agora</span>
      <strong>${escapeHtml(current?.key || String(metrics.active || 0))}</strong>
      <small>${escapeHtml(current ? `${current.title} - prazo ${formatDate(current.end)}` : `${metrics.active || 0} acoes em execucao`)}</small>
    </article>
    <article class="executive-stat-card ${alertCount ? "is-alert" : ""}">
      <span>Em risco</span>
      <strong>${escapeHtml(String(alertCount))}</strong>
      <small>${alertCount ? "Deadlines criticos ou proximos." : "Sem alertas criticos neste momento."}</small>
    </article>
    <article class="executive-stat-card">
      <span>Proxima a iniciar</span>
      <strong>${escapeHtml(upcoming?.key || topOwner?.[0] || "n/d")}</strong>
      <small>${escapeHtml(upcoming ? `${upcoming.title} - ${formatDate(upcoming.start)}` : topOwner ? `${topOwner[0]} com maior carga no plano` : "Sem marco futuro identificado.")}</small>
    </article>`;
}

function renderDashboardSummaryCards(metrics = {}) {
  if (!state.project) {
    els.dashboardSummaryCards.innerHTML = `
      <div class="overview-feature">
        <span>Agora</span>
        <strong>Leitura do trabalho em execucao</strong>
        <small>Timeline imediata</small>
      </div>
      <div class="overview-feature">
        <span>Risco</span>
        <strong>Deadlines e pontos de atencao</strong>
        <small>Follow-up prioritario</small>
      </div>
      <div class="overview-feature">
        <span>Seguinte</span>
        <strong>Proximas acoes e proximos marcos</strong>
        <small>Preparacao da proxima vaga</small>
      </div>`;
    return;
  }

  const criticalCount = (metrics.overdue || 0) + (metrics.due_soon || 0);
  const current = state.editDraft
    .filter((task) => task.bucket === "active" && task.end)
    .sort((left, right) => left.end.localeCompare(right.end))[0];
  const nextTask = state.editDraft
    .filter((task) => task.bucket === "upcoming" && task.start)
    .sort((left, right) => left.start.localeCompare(right.start))[0];

  els.dashboardSummaryCards.innerHTML = `
    <div class="overview-feature">
      <span>Agora</span>
      <strong>${escapeHtml(current ? `${current.key} - ${current.title}` : `${metrics.active || 0} acoes em execucao`)}</strong>
      <small>${escapeHtml(current ? `${current.parent || "Sem parent"} | fim ${formatDate(current.end)}` : "Sem item critico em curso identificado")}</small>
    </div>
    <div class="overview-feature">
      <span>Risco</span>
      <strong>${escapeHtml(String(criticalCount))} itens exigem acompanhamento imediato</strong>
      <small>${escapeHtml(`${metrics.overdue || 0} em atraso | ${metrics.due_soon || 0} com prazo proximo`)}</small>
    </div>
    <div class="overview-feature">
      <span>Seguinte</span>
      <strong>${escapeHtml(nextTask ? `${nextTask.key} - ${nextTask.title}` : "Sem proxima acao identificada")}</strong>
      <small>${escapeHtml(nextTask ? `${nextTask.parent || "Sem parent"} | arranque ${formatDate(nextTask.start)}` : "Sem onda seguinte calendarizada")}</small>
    </div>`;
}

function renderEditableBlock(container, rows, emptyMessage) {
  if (!rows.length) {
    container.innerHTML = `<p class="muted">${emptyMessage}</p>`;
    return;
  }

  const options = currentStatusOptions();
  container.innerHTML = `
    <div class="block-summary">
      <strong>${rows.length} items nesta vista</strong>
      <span>Qualquer alteracao aqui fica sincronizada com o plano geral, timeline e exportacao.</span>
    </div>
    <table class="summary-edit-table">
      <thead>
        <tr>
          <th>Key</th>
          <th>Acao</th>
          <th>Parent</th>
          <th>Responsavel</th>
          <th>Status</th>
          <th>Inicio</th>
          <th>Fim</th>
          <th>Release</th>
          <th>Vista</th>
        </tr>
      </thead>
      <tbody>
        ${rows
          .slice(0, 12)
          .map(({ task, index }) => {
            const statusOptions = options
              .map((status) => `<option value="${escapeHtml(status)}" ${task.status === status ? "selected" : ""}>${escapeHtml(status)}</option>`)
              .join("");
            return `
              <tr>
                <td class="summary-key">${escapeHtml(task.key)}</td>
                <td>
                  <div class="issue-edit-cell">
                    <input data-index="${index}" name="title" type="text" value="${escapeHtml(task.title)}" />
                    <small>${escapeHtml(task.type || "Issue")} | ${escapeHtml(task.release || "Sem release")}</small>
                    ${renderTaskNotesEditor(task, index)}
                  </div>
                </td>
                <td><input data-index="${index}" name="parent" type="text" value="${escapeHtml(task.parent)}" /></td>
                <td><input data-index="${index}" name="assignee" type="text" value="${escapeHtml(task.assignee)}" /></td>
                <td><select data-index="${index}" name="status">${statusOptions}</select></td>
                <td><input data-index="${index}" name="start" type="date" value="${escapeHtml(task.start)}" /></td>
                <td><input data-index="${index}" name="end" type="date" value="${escapeHtml(task.end)}" /></td>
                <td><input data-index="${index}" name="release" type="text" value="${escapeHtml(task.release)}" /></td>
                <td><span class="pill ${escapeHtml(task.bucket)}">${escapeHtml(task.bucket)}</span></td>
              </tr>`;
          })
          .join("")}
      </tbody>
    </table>`;
}

function renderEditorStatus(message = "") {
  if (message) {
    els.editorStatus.textContent = message;
    return;
  }

  if (!state.project) {
    els.editorStatus.textContent = "Carrega um projeto para editar o plano.";
    return;
  }

  const conflictTask = state.editDraft.find((task) => task.date_conflict);
  if (conflictTask) {
    els.editorStatus.textContent = `Existe um conflito de datas em ${conflictTask.key || conflictTask.title}: a data de inicio nao pode ser posterior a data de fim.`;
    return;
  }

  const incompleteTask = state.editDraft.find((task) => !String(task.key || "").trim() || !String(task.title || "").trim());
  if (incompleteTask) {
    els.editorStatus.textContent = `Existe uma linha incompleta em ${incompleteTask.key || "nova linha"}. Preenche pelo menos o titulo antes de guardar ou exportar.`;
    return;
  }

  const missingDateNoteCount = state.editDraft.filter((task) => taskNeedsDateNote(task)).length;
  if (missingDateNoteCount) {
    els.editorStatus.textContent = `${missingDateNoteCount} ${missingDateNoteCount === 1 ? "item tem" : "itens tem"} datas alteradas sem nota de justificacao. Recomenda-se registar o motivo antes de exportar ou fechar o planeamento.`;
    return;
  }

  els.editorStatus.textContent = state.isDirty
    ? "Existem alteracoes por guardar. A exportacao guarda automaticamente antes de gerar o Excel."
    : "Todas as alteracoes estao guardadas e prontas para exportacao.";
}

function filteredDraftRows() {
  const search = els.editorSearch.value.trim().toLowerCase();
  const filter = els.editorFilter.value;

  return state.editDraft
    .map((task, index) => ({ task, index }))
    .filter(({ task }) => {
      const haystack = [task.key, task.title, task.assignee, task.release, task.parent, task.type, task.notes].join(" ").toLowerCase();
      if (search && !haystack.includes(search)) return false;
      if (filter === "risk") return task.bucket === "overdue" || task.bucket === "due_soon";
      if (filter === "all") return true;
      return task.bucket === filter;
    });
}

function renderEditor() {
  if (!state.project) {
    els.editorTable.innerHTML = `<div class="gantt-board empty">Carrega um projeto para visualizar e editar o plano geral.</div>`;
    renderEditorStatus();
    return;
  }

  const rows = filteredDraftRows();
  const options = currentStatusOptions();

  if (!rows.length) {
    els.editorTable.innerHTML = `<div class="gantt-board empty">Nenhuma tarefa encontrada para os filtros atuais.</div>`;
    renderEditorStatus();
    return;
  }

  els.editorTable.innerHTML = `
    <table class="editor-table">
      <thead>
        <tr>
          <th>Key</th>
          <th>Titulo</th>
          <th>Status</th>
          <th>Responsavel</th>
          <th>Inicio</th>
          <th>Fim</th>
          <th>Release</th>
          <th>Parent</th>
          <th>Tipo</th>
          <th>Dur.</th>
          <th>Vista</th>
          <th>Acoes</th>
        </tr>
      </thead>
      <tbody>
        ${rows
          .map(({ task, index }) => {
            const optionMarkup = options
              .map((status) => `<option value="${escapeHtml(status)}" ${task.status === status ? "selected" : ""}>${escapeHtml(status)}</option>`)
              .join("");

            return `
              <tr>
                <td class="readonly-key">${escapeHtml(task.key)}</td>
                <td>
                  <div class="issue-edit-cell">
                    <input data-index="${index}" name="title" type="text" value="${escapeHtml(task.title)}" />
                    <small>${escapeHtml(task.parent || "Sem parent")} | ${escapeHtml(task.release || "Sem release")}</small>
                    ${renderTaskNotesEditor(task, index)}
                  </div>
                </td>
                <td><select data-index="${index}" name="status">${optionMarkup}</select></td>
                <td><input data-index="${index}" name="assignee" type="text" value="${escapeHtml(task.assignee)}" /></td>
                <td><input data-index="${index}" name="start" type="date" value="${escapeHtml(task.start)}" /></td>
                <td><input data-index="${index}" name="end" type="date" value="${escapeHtml(task.end)}" /></td>
                <td><input data-index="${index}" name="release" type="text" value="${escapeHtml(task.release)}" /></td>
                <td><input data-index="${index}" name="parent" type="text" value="${escapeHtml(task.parent)}" /></td>
                <td><input data-index="${index}" name="type" type="text" value="${escapeHtml(task.type)}" /></td>
                <td>${escapeHtml(String(task.duration_days || ""))}</td>
                <td><span class="pill ${escapeHtml(task.bucket)}">${escapeHtml(task.bucket)}</span></td>
                <td class="row-actions-cell">
                  <button type="button" class="row-delete-btn" data-action="delete-plan-row" data-index="${index}">Apagar</button>
                </td>
              </tr>`;
          })
          .join("")}
      </tbody>
    </table>`;

  renderEditorStatus();
}

function monday(dateValue) {
  const value = parseIsoDate(dateValue) || new Date(dateValue);
  const day = value.getDay() || 7;
  value.setDate(value.getDate() - day + 1);
  value.setHours(0, 0, 0, 0);
  return value;
}

function buildWeeks(tasks) {
  const dated = tasks.filter((task) => task.start && task.end);
  if (!dated.length) return [];
  let start = monday(dated.reduce((min, task) => (task.start < min.start ? task : min)).start);
  let end = monday(dated.reduce((max, task) => (task.end > max.end ? task : max)).end);
  const weeks = [];
  while (start <= end) {
    weeks.push(new Date(start));
    start.setDate(start.getDate() + 7);
  }
  return weeks;
}

function renderGantt(tasks) {
  if (!tasks?.length) {
    els.ganttBoard.classList.add("empty");
    els.ganttBoard.textContent = "Importa ou abre um projeto para visualizar a timeline.";
    return;
  }

  const weeks = buildWeeks(tasks);
  const todayMarker = buildTodayMarker(weeks);
  const dayCells = weeks
    .map((week, index) => {
      const isToday = Boolean(todayMarker && todayMarker.weekIndex === index);
      return `
        <div
          class="gantt-cell gantt-day-cell ${isToday ? "is-today" : ""}"
          ${isToday ? `style="--today-offset:${todayMarker.offsetPercent.toFixed(2)}%"` : ""}
          title="${escapeHtml(week.toLocaleDateString("pt-PT"))}"
        >
          ${isToday ? '<span class="today-pill">Hoje</span>' : ""}
          <strong>${escapeHtml(week.toLocaleDateString("pt-PT", { day: "2-digit" }))}</strong>
        </div>`;
    })
    .join("");

  const buildBandCells = (formatter) => {
    if (!weeks.length) return "";
    const bands = [];
    let startIndex = 0;
    let currentLabel = formatter(weeks[0]);
    for (let index = 1; index <= weeks.length; index += 1) {
      const nextLabel = index < weeks.length ? formatter(weeks[index]) : "";
      if (index === weeks.length || nextLabel !== currentLabel) {
        const span = index - startIndex;
        const hasToday = Boolean(todayMarker && todayMarker.weekIndex >= startIndex && todayMarker.weekIndex < index);
        const relativeOffset = hasToday
          ? ((((todayMarker.weekIndex - startIndex) + (todayMarker.offsetPercent / 100)) / span) * 100)
          : 0;
        bands.push({
          label: currentLabel,
          startColumn: 5 + startIndex,
          span,
          hasToday,
          relativeOffset,
        });
        startIndex = index;
        currentLabel = nextLabel;
      }
    }
    return bands
      .map(
        (band) => `
          <div
            class="gantt-cell gantt-band-cell ${band.hasToday ? "has-today-line" : ""}"
            style="grid-column:${band.startColumn} / span ${band.span}${band.hasToday ? `; --today-offset:${band.relativeOffset.toFixed(2)}%` : ""}"
          >
            ${escapeHtml(band.label)}
          </div>`,
      )
      .join("");
  };

  const yearBands = buildBandCells((week) => week.toLocaleDateString("pt-PT", { year: "numeric" }));
  const monthBands = buildBandCells((week) => capitalizeLabel(week.toLocaleDateString("pt-PT", { month: "long" })));

  const rows = tasks.slice(0, 80).map((task) => {
    const start = task.start ? monday(task.start) : null;
    const end = task.end ? parseIsoDate(task.end) : null;
    const weekCells = weeks
      .map((week, index) => {
        const weekEnd = new Date(week);
        weekEnd.setDate(weekEnd.getDate() + 6);
        const hit = start && end && week <= end && weekEnd >= start;
        const isToday = Boolean(todayMarker && todayMarker.weekIndex === index);
        return `
          <div
            class="gantt-cell week-cell ${hit ? `hit ${task.bucket}` : ""} ${isToday ? "today-marker-cell" : ""}"
            ${isToday ? `style="--today-offset:${todayMarker.offsetPercent.toFixed(2)}%"` : ""}
          ></div>`;
      })
      .join("");

    return `
      <div class="gantt-row">
        <div class="gantt-cell sticky issue-col issue-gantt-cell">
          <strong>${escapeHtml(task.title)}</strong>
          <small>${escapeHtml(task.release || "Sem release")}</small>
        </div>
        <div class="gantt-cell parent-col" title="${escapeHtml(task.parent || "Sem parent")}">${escapeHtml(task.parent || "Sem parent")}</div>
        <div class="gantt-cell status-col" title="${escapeHtml(task.status)}">${escapeHtml(task.status)}</div>
        <div class="gantt-cell deadline-col" title="${escapeHtml(formatDate(task.end))}">${escapeHtml(formatCompactDate(task.end))}</div>
        ${weekCells}
      </div>`;
  });

  els.ganttBoard.classList.remove("empty");
  els.ganttBoard.innerHTML = `
    <div class="gantt-grid" style="--week-count:${weeks.length}">
      <div class="gantt-header gantt-header-year">
        <div class="gantt-cell gantt-stub sticky-stub">Timeline</div>
        ${yearBands}
      </div>
      <div class="gantt-header gantt-header-month">
        <div class="gantt-cell gantt-stub sticky-stub">Calendario</div>
        ${monthBands}
      </div>
      <div class="gantt-header gantt-header-days">
        <div class="gantt-cell sticky issue-col">Acao</div>
        <div class="gantt-cell parent-col">Parent</div>
        <div class="gantt-cell status-col">Status</div>
        <div class="gantt-cell deadline-col">Deadline</div>
        ${dayCells}
      </div>
      ${rows.join("")}
    </div>`;
}

function renderWorkspace() {
  renderAuthState();
  renderProjectMeta();
  if (els.projectSelect) {
    els.projectSelect.disabled = !state.currentUser;
  }
  if (els.loadProject) {
    els.loadProject.disabled = !state.currentUser;
  }
  if (els.refreshProjects) {
    els.refreshProjects.disabled = !state.currentUser;
  }
  if (els.exportProject) {
    els.exportProject.disabled = !state.currentUser || !state.project;
  }
  if (els.saveEdits) {
    els.saveEdits.disabled = !state.currentUser || !state.project;
  }
  if (els.addPlanRow) {
    els.addPlanRow.disabled = !state.project || !state.currentUser;
  }
  if (els.userCreateForm) {
    for (const element of els.userCreateForm.querySelectorAll("button, input")) {
      element.disabled = !isAdmin();
    }
  }
  for (const form of [els.importForm, els.alertForm, els.aiConfigForm]) {
    if (!form) continue;
    for (const element of form.querySelectorAll("button, input, select, textarea")) {
      element.disabled = !isAdmin();
    }
  }
  renderUserDirectory();

  if (!state.currentUser || !state.project) {
    renderSidebarOverview({});
    renderProjectOptions();
    renderAiWorkspace();
    renderExecutiveStripCompact({});
    renderStatusOverview({});
    renderExecutivePulse({});
    renderKpis({});
    renderDashboardSummaryCardsCompact({});
    renderReleaseBars([]);
    renderAssigneeSummary({});
    renderDashboardDeadlines();
    renderEditableBlock(els.activeActions, [], "Sem acoes em curso.");
    renderEditableBlock(els.upcomingActions, [], "Sem proximas acoes.");
    renderEditableBlock(els.riskActions, [], "Sem prazos criticos.");
    renderEditor();
    renderGantt([]);
    return;
  }

  const metrics = deriveMetrics(state.editDraft, state.settingsDraft);
  renderSidebarOverview(metrics);
  renderProjectOptions(metrics);
  renderAiWorkspace();
  renderExecutiveStripCompact(metrics);
  renderStatusOverview(metrics);
  renderExecutivePulse(metrics);
  renderKpis(metrics);
  renderDashboardSummaryCardsCompact(metrics);
  renderReleaseBars(metrics.release_breakdown || []);
  renderAssigneeSummary(metrics);
  renderDashboardDeadlines();
  renderEditableBlock(els.activeActions, indexedTasks((task) => task.bucket === "active"), "Sem acoes em curso.");
  renderEditableBlock(els.upcomingActions, indexedTasks((task) => task.bucket === "upcoming"), "Sem proximas acoes.");
  renderEditableBlock(els.riskActions, indexedTasks((task) => task.bucket === "overdue" || task.bucket === "due_soon"), "Sem prazos criticos.");
  renderEditor();
  renderGantt(state.editDraft);
}

function refreshDirtyState() {
  state.isDirty =
    Boolean(state.project) &&
    (
      taskSignature(state.editDraft) !== taskSignature(state.project.tasks || []) ||
      settingsSignature(state.settingsDraft) !== settingsSignature(state.project.settings || DEFAULT_PROJECT_SETTINGS)
    );
  if (state.isDirty) {
    state.saveState = "idle";
  }
  renderProjectMeta();
  renderEditorStatus();
}

function updateTaskFromTarget(target) {
  if (!(target instanceof HTMLInputElement || target instanceof HTMLSelectElement || target instanceof HTMLTextAreaElement)) return false;
  const index = Number(target.dataset.index);
  const field = target.name;
  if (Number.isNaN(index) || !field || !state.editDraft[index]) return false;
  const nextValue = field === "notes" ? target.value.replace(/\r\n/g, "\n") : target.value.trim();
  const nextTask = { ...state.editDraft[index], [field]: nextValue };
  state.editDraft[index] = normalizeTask(nextTask, state.editDraft[index].line || index + 4);
  refreshDirtyState();
  return true;
}

function addPlanRow() {
  if (!state.project) return;

  els.editorSearch.value = "";
  els.editorFilter.value = "all";
  const task = normalizeTask(
    {
      key: nextManualTaskKey(),
      title: "Nova acao",
      type: "Task",
      parent: "",
      assignee: "",
      status: "Open",
      start: "",
      end: "",
      notes: "",
      release: "",
      line: nextInsertedLine(),
    },
    nextInsertedLine(),
  );

  state.editDraft.unshift(task);
  refreshDirtyState();
  renderWorkspace();

  window.requestAnimationFrame(() => {
    const input = document.querySelector('#editorTable input[data-index="0"][name="title"]');
    if (input instanceof HTMLInputElement) {
      input.focus();
      input.select();
    }
  });

  queueAutoSave(900);
}

function deletePlanRow(index) {
  if (Number.isNaN(index) || !state.editDraft[index]) return;
  const task = state.editDraft[index];
  const label = task.key || task.title || "esta linha";
  if (!window.confirm(`Queres apagar ${label}?`)) {
    return;
  }
  state.editDraft.splice(index, 1);
  refreshDirtyState();
  renderWorkspace();
  queueAutoSave(600);
}

function updateReleaseWeight(value, { rerender = true } = {}) {
  state.settingsDraft = normalizeProjectSettings(
    { ...state.settingsDraft, release_weight: value },
    releaseNamesFromTasks(state.editDraft),
  );
  refreshDirtyState();
  if (rerender) {
    renderWorkspace();
  }
}

function updateReleaseSpecificWeight(releaseName, value, { rerender = false } = {}) {
  const normalizedReleaseName = String(releaseName || "").trim();
  if (!normalizedReleaseName) return false;
  const numericValue = Number(value);
  const nextWeights = {
    ...(state.settingsDraft.release_weights || {}),
    [normalizedReleaseName]: Number.isFinite(numericValue) ? Math.max(0, Math.round(numericValue * 100) / 100) : 0,
  };
  state.settingsDraft = normalizeProjectSettings(
    { ...state.settingsDraft, release_weights: nextWeights },
    releaseNamesFromTasks(state.editDraft),
  );
  refreshDirtyState();
  if (rerender) {
    renderWorkspace();
  }
  return true;
}

function syncActiveInput() {
  const active = document.activeElement;
  if (!active) return;

  if ((active instanceof HTMLInputElement || active instanceof HTMLSelectElement || active instanceof HTMLTextAreaElement) && active.dataset.index && active.name) {
    updateTaskFromTarget(active);
    return;
  }

  if (active instanceof HTMLInputElement && active.dataset.releaseWeight) {
    updateReleaseSpecificWeight(active.dataset.releaseWeight, active.value);
    return;
  }

  if (active === els.releaseWeightRange || active === els.releaseWeightNumber) {
    updateReleaseWeight(active.value, { rerender: false });
  }
}

function findDateConflictTask() {
  return state.editDraft.find((task) => task.date_conflict);
}

function findIncompleteTask() {
  return state.editDraft.find((task) => !String(task.key || "").trim() || !String(task.title || "").trim());
}

function queueAutoSave(delay = 700) {
  if (!state.project) return;
  if (state.autoSaveTimer) {
    window.clearTimeout(state.autoSaveTimer);
  }
  state.autoSaveTimer = window.setTimeout(async () => {
    state.autoSaveTimer = null;
    if (!state.isDirty) return;
    if (activeNotesEditor()) {
      queueAutoSave(Math.max(delay, 1800));
      return;
    }
    try {
      await saveEdits({ silent: true });
    } catch (error) {
      handleError(error);
    }
  }, delay);
}

async function fetchJson(url, options = {}) {
  const { allowUnauthorized = false, ...fetchOptions } = options;
  const response = await fetch(apiUrl(url), {
    credentials: "include",
    ...fetchOptions,
  });
  const contentType = response.headers.get("content-type") || "";
  const payload = contentType.includes("application/json")
    ? await response.json()
    : { error: await response.text() };
  if (!response.ok) {
    if (allowUnauthorized && response.status === 401) {
      return null;
    }
    const error = new Error(payload.error || "O pedido falhou.");
    error.status = response.status;
    error.payload = payload;
    throw error;
  }
  return payload;
}

async function loadSession() {
  const payload = await fetchJson("/api/auth/session", { allowUnauthorized: true });
  state.currentUser = payload?.user || null;
  renderAuthState();
  return state.currentUser;
}

async function loadUsers() {
  if (!isAdmin()) {
    state.users = [];
    renderUserDirectory();
    return;
  }
  const payload = await fetchJson("/api/users");
  state.users = payload.users || [];
  renderUserDirectory();
}

async function hydrateWorkspace() {
  await loadProjects();
  if (isAdmin()) {
    await Promise.all([loadAlertConfig(), loadAiConfig(), loadUsers()]);
  } else {
    state.alertConfig = null;
    state.aiConfig = null;
    state.users = [];
    renderUserDirectory();
  }

  const remembered = window.localStorage.getItem(STORAGE_KEYS.project);
  const initialProject = remembered && state.projects.some((project) => project.slug === remembered)
    ? remembered
    : state.projects[0]?.slug;

  if (initialProject) {
    const project = await fetchJson(`/api/project?slug=${encodeURIComponent(initialProject)}`);
    renderProject(project);
    return;
  }

  await loadAiHistory();
  renderWorkspace();
}

async function login(username, password) {
  const payload = await fetchJson("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  state.currentUser = payload.user || null;
  renderAuthState();
  return payload.user;
}

async function logout() {
  try {
    await fetchJson("/api/auth/logout", { method: "POST" });
  } finally {
    state.currentUser = null;
    resetWorkspaceState();
    setCurrentPage("dashboard");
    renderProjects();
    renderWorkspace();
    renderAuthState();
  }
}

function isUnauthorizedError(error) {
  return Number(error?.status || 0) === 401;
}

function handleUnauthorized() {
  state.currentUser = null;
  resetWorkspaceState();
  renderProjects();
  renderWorkspace();
  renderAuthState();
  renderLoginMessage("A tua sessao expirou. Inicia sessao novamente para continuar.", true);
  setCurrentPage("dashboard");
}

async function submitLoginForm() {
  const username = String(els.loginUsername?.value || "").trim();
  const password = String(els.loginPassword?.value || "");
  if (!username || !password) {
    renderLoginMessage("Preenche user e password para entrar.", true);
    return;
  }
  renderLoginMessage("A validar acesso...");
  await login(username, password);
  if (els.loginPassword) {
    els.loginPassword.value = "";
  }
  renderLoginMessage();
  await hydrateWorkspace();
}

function ensureAdminAccess() {
  if (isAdmin()) return true;
  window.alert("Esta area esta reservada ao administrador.");
  setCurrentPage("dashboard");
  return false;
}

async function handleUserCreation() {
  if (!ensureAdminAccess()) return;
  const form = new FormData(els.userCreateForm);
  const payload = Object.fromEntries(form.entries());
  const result = await fetchJson("/api/users", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  state.users = result.users || state.users;
  renderUserDirectory();
  els.userCreateForm.reset();
  window.alert("Utilizador criado com sucesso.");
}

function renderProject(project) {
  state.project = project;
  state.editDraft = cloneTasks(project.tasks || []);
  state.project.settings = normalizeProjectSettings(project.settings || DEFAULT_PROJECT_SETTINGS, releaseNamesFromTasks(state.editDraft));
  state.settingsDraft = normalizeProjectSettings(state.project.settings, releaseNamesFromTasks(state.editDraft));
  state.aiMessages = normalizeAiMessages(project.workspace_history || []);
  state.lastAiReply = [...state.aiMessages].reverse().find((message) => message.role === "assistant")?.content || "";
  state.isDirty = false;
  state.saveState = "saved";
  window.localStorage.setItem(STORAGE_KEYS.project, project.slug);
  renderProjects();
  renderConnectionNotice(
    IS_FILE_MODE
      ? "A aplicacao foi aberta em file:// e esta a usar o servidor local em http://127.0.0.1:8000."
      : "",
  );
  renderWorkspace();
}

async function loadProjects() {
  const payload = await fetchJson("/api/projects");
  state.projects = payload.projects || [];
  renderProjects();
}

async function loadAlertConfig() {
  if (!isAdmin()) {
    state.alertConfig = null;
    if (els.alertForm) {
      els.alertForm.reset();
    }
    return;
  }
  state.alertConfig = await fetchJson("/api/alerts/config");
  Object.entries(state.alertConfig).forEach(([key, value]) => {
    const field = els.alertForm.elements.namedItem(key);
    if (!field) return;
    if (field.type === "checkbox") {
      field.checked = Boolean(value);
    } else if (Array.isArray(value)) {
      field.value = value.join(", ");
    } else {
      field.value = value ?? "";
    }
  });
}

async function loadAiConfig() {
  if (!isAdmin()) {
    state.aiConfig = null;
    renderAiWorkspace();
    return;
  }
  state.aiConfig = await fetchJson("/api/ai/config");
  if (!els.aiConfigForm) return;
  Object.entries(state.aiConfig).forEach(([key, value]) => {
    const field = els.aiConfigForm.elements.namedItem(key);
    if (!field) return;
    field.value = value ?? "";
  });
  const apiKeyField = els.aiConfigForm.elements.namedItem("api_key");
  if (apiKeyField instanceof HTMLInputElement) {
    apiKeyField.value = "";
    apiKeyField.placeholder = state.aiConfig?.api_key_configured
      ? "Configurada por variavel de ambiente OPENAI_API_KEY"
      : "Definir OPENAI_API_KEY no servidor ou no Render";
  }
  renderAiWorkspace();
}

function aiHistoryForRequest() {
  return state.aiMessages
    .slice(-10)
    .filter((message) => message.role === "user" || message.role === "assistant")
    .map(({ role, content }) => ({ role, content }));
}

function pushAiMessage(role, content) {
  state.aiMessages.push({ role, content: String(content || "").trim() });
  renderAiMessages();
}

function ensureAiUserMessage(prompt) {
  const normalizedPrompt = String(prompt || "").trim();
  if (!normalizedPrompt) return false;
  const lastMessage = state.aiMessages[state.aiMessages.length - 1];
  if (lastMessage?.role === "user" && lastMessage.content === normalizedPrompt) {
    return false;
  }
  pushAiMessage("user", normalizedPrompt);
  return true;
}

async function persistAiHistory() {
  await fetchJson("/api/ai/history", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      project_slug: state.project?.slug || "",
      messages: state.aiMessages,
    }),
  });
}

async function loadAiHistory(projectSlug = "") {
  const payload = await fetchJson(`/api/ai/history${projectSlug ? `?slug=${encodeURIComponent(projectSlug)}` : ""}`);
  state.aiMessages = normalizeAiMessages(payload.messages || []);
  state.lastAiReply = [...state.aiMessages].reverse().find((message) => message.role === "assistant")?.content || "";
  renderAiWorkspace();
}

function setAiBusy(isBusy) {
  state.aiBusy = isBusy;
  renderAiWorkspace();
}

async function ensureProjectSavedForAi() {
  syncActiveInput();
  if (state.project && state.isDirty) {
    await saveEdits({ silent: true });
  }
}

async function submitAiPrompt(prompt) {
  const normalizedPrompt = String(prompt || "").trim();
  if (!normalizedPrompt) {
    window.alert("Escreve primeiro um pedido.");
    return;
  }

  await ensureProjectSavedForAi();
  const history = aiHistoryForRequest();
  const addedUserMessage = ensureAiUserMessage(normalizedPrompt);
  if (addedUserMessage) {
    await persistAiHistory();
  }
  setAiBusy(true);
  try {
    const payload = await fetchJson("/api/ai/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        project_slug: state.project?.slug || "",
        prompt: normalizedPrompt,
        history,
      }),
    });
    state.lastAiReply = payload.reply || "";
    pushAiMessage("assistant", payload.reply || "Sem resposta devolvida.");
    await persistAiHistory();
  } finally {
    setAiBusy(false);
  }
}

function downloadLastAiReply() {
  if (!state.lastAiReply) {
    window.alert("Ainda nao existe uma resposta para descarregar.");
    return;
  }
  const blob = new Blob([state.lastAiReply], { type: "text/markdown;charset=utf-8" });
  const link = document.createElement("a");
  const baseName = state.project?.slug || "copilot";
  link.href = URL.createObjectURL(blob);
  link.download = `${baseName}-workspace-resposta.md`;
  link.click();
  URL.revokeObjectURL(link.href);
}

async function generateSteeringFromPrompt(prompt) {
  if (!state.project?.slug) {
    window.alert("Carrega um projeto antes de gerar o steering.");
    return;
  }

  await ensureProjectSavedForAi();
  const normalizedPrompt = String(prompt || "").trim();

  setAiBusy(true);
  try {
    const payload = await fetchJson("/api/ai/export", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        project_slug: state.project.slug,
        kind: "steering_pptx",
        prompt: normalizedPrompt,
      }),
    });
    state.generatedAiFiles.unshift({
      file: payload.file,
      name: payload.name,
      label: "Steering PPTX",
    });
    state.generatedAiFiles = state.generatedAiFiles.slice(0, 6);
    renderGeneratedAiFiles();
    if (payload.warning) {
      pushAiMessage("assistant", `Steering PPTX gerado. ${payload.warning}`);
    } else {
      pushAiMessage("assistant", `Steering PPTX gerado: ${payload.name}`);
    }
    await persistAiHistory();
    window.open(apiUrl(payload.file), "_blank", "noopener");
  } finally {
    setAiBusy(false);
  }
}

async function saveEdits({ silent = false } = {}) {
  if (!state.project) throw new Error("Carrega um projeto antes de guardar.");
  syncActiveInput();

  const dateConflictTask = findDateConflictTask();
  if (dateConflictTask) {
    throw new Error(`Corrige primeiro as datas de ${dateConflictTask.key || dateConflictTask.title}. A data de inicio nao pode ser posterior a data de fim.`);
  }

  const incompleteTask = findIncompleteTask();
  if (incompleteTask) {
    throw new Error(`Preenche primeiro o titulo da linha ${incompleteTask.key || "nova linha"} antes de guardar ou exportar.`);
  }

  if (!state.isDirty) {
    state.saveState = "saved";
    renderSaveState();
    renderEditorStatus();
    return state.project;
  }

  if (state.autoSaveTimer) {
    window.clearTimeout(state.autoSaveTimer);
    state.autoSaveTimer = null;
  }

  state.saveState = "saving";
  renderSaveState();
  renderEditorStatus("A guardar alteracoes...");
  const project = await fetchJson("/api/project/update", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      project_slug: state.project.slug,
      project: state.project.project,
      settings: state.settingsDraft,
      tasks: state.editDraft,
    }),
  });

  renderProject(project);
  state.saveState = "saved";
  renderSaveState();
  if (project.warning && !silent) {
    window.alert(project.warning);
  }
  if (!silent) {
    window.alert("Alteracoes guardadas com sucesso.");
  }
  return project;
}

function handleError(error) {
  console.error(error);
  if (isUnauthorizedError(error)) {
    handleUnauthorized();
    return;
  }
  state.saveState = "error";
  renderSaveState();
  if (IS_FILE_MODE) {
    renderConnectionNotice("Abre o servidor local em http://127.0.0.1:8000. Se estiver desligado, executa o app.py e faz refresh.");
  }
  window.alert(error.message);
}

els.loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    await submitLoginForm();
  } catch (error) {
    renderLoginMessage(error.message, true);
  }
});

els.navLinks.forEach((button) => {
  button.addEventListener("click", () => setCurrentPage(button.dataset.page));
});

window.addEventListener("hashchange", () => {
  const page = window.location.hash.replace("#", "");
  if (PAGE_CONFIG[page]) {
    setCurrentPage(page, false);
  }
});

els.importForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    if (!ensureAdminAccess()) return;
    const formData = new FormData(els.importForm);
    const project = await fetchJson("/api/import", { method: "POST", body: formData });
    await loadProjects();
    renderProject(project);
    setCurrentPage("dashboard");
    window.alert("Projeto importado com sucesso.");
  } catch (error) {
    handleError(error);
  }
});

els.refreshProjects.addEventListener("click", async () => {
  try {
    await loadProjects();
  } catch (error) {
    handleError(error);
  }
});

els.loadProject.addEventListener("click", async () => {
  try {
    if (!els.projectSelect.value) return;
    syncActiveInput();
    if (state.isDirty) {
      await saveEdits({ silent: true });
    }
    const project = await fetchJson(`/api/project?slug=${encodeURIComponent(els.projectSelect.value)}`);
    renderProject(project);
  } catch (error) {
    handleError(error);
  }
});

els.exportProject.addEventListener("click", async () => {
  try {
    if (!state.project?.slug) {
      window.alert("Carrega um projeto antes de exportar.");
      return;
    }
    syncActiveInput();
    if (state.isDirty) {
      await saveEdits({ silent: true });
    }
    const payload = await fetchJson("/api/export", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ project_slug: state.project.slug }),
    });
    if (payload.warning) {
      window.alert(payload.warning);
    }
    window.open(apiUrl(payload.file), "_blank", "noopener");
  } catch (error) {
    handleError(error);
  }
});

els.alertForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    if (!ensureAdminAccess()) return;
    const form = new FormData(els.alertForm);
    const payload = Object.fromEntries(form.entries());
    payload.enabled = els.alertForm.elements.namedItem("enabled").checked;
    payload.recipients = String(payload.recipients || "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean);
    payload.days_before_deadline = Number(payload.days_before_deadline || 7);
    payload.project_slug = state.project?.slug || "";
    await fetchJson("/api/alerts/config", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    window.alert("Configuracao de alertas guardada.");
  } catch (error) {
    handleError(error);
  }
});

els.aiConfigForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    if (!ensureAdminAccess()) return;
    const form = new FormData(els.aiConfigForm);
    const payload = Object.fromEntries(form.entries());
    state.aiConfig = await fetchJson("/api/ai/config", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    renderAiWorkspace();
    window.alert("Configuracao GPT guardada.");
  } catch (error) {
    handleError(error);
  }
});

els.projectOptionsForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    if (!state.project) {
      window.alert("Carrega um projeto antes de guardar opcoes.");
      return;
    }
    await saveEdits();
  } catch (error) {
    handleError(error);
  }
});

els.releaseWeightRange.addEventListener("input", (event) => {
  updateReleaseWeight(event.target.value);
  queueAutoSave(500);
});

els.releaseWeightNumber.addEventListener("input", (event) => {
  updateReleaseWeight(event.target.value);
  queueAutoSave(500);
});

els.releaseWeightsEditor.addEventListener("input", (event) => {
  const target = event.target;
  if (!(target instanceof HTMLInputElement) || !target.dataset.releaseWeight) return;
  updateReleaseSpecificWeight(target.dataset.releaseWeight, target.value);
  queueAutoSave(600);
});

els.releaseWeightsEditor.addEventListener("change", (event) => {
  const target = event.target;
  if (!(target instanceof HTMLInputElement) || !target.dataset.releaseWeight) return;
  if (updateReleaseSpecificWeight(target.dataset.releaseWeight, target.value)) {
    renderWorkspace();
    queueAutoSave(450);
  }
});

els.testAlert.addEventListener("click", async () => {
  try {
    if (!ensureAdminAccess()) return;
    if (!state.project?.slug) {
      window.alert("Carrega um projeto antes de testar alertas.");
      return;
    }
    syncActiveInput();
    if (state.isDirty) {
      await saveEdits({ silent: true });
    }
    const result = await fetchJson("/api/alerts/test", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ project_slug: state.project.slug }),
    });
    window.alert(result.message);
  } catch (error) {
    handleError(error);
  }
});

els.saveEdits.addEventListener("click", async () => {
  try {
    await saveEdits();
  } catch (error) {
    handleError(error);
  }
});

els.logoutButton.addEventListener("click", async () => {
  try {
    await logout();
  } catch (error) {
    handleError(error);
  }
});

els.resetEdits.addEventListener("click", () => {
  state.editDraft = cloneTasks(state.project?.tasks || []);
  state.isDirty = false;
  renderWorkspace();
  renderEditorStatus("Plano reposto com a ultima versao guardada.");
});

els.addPlanRow.addEventListener("click", () => {
  addPlanRow();
});

els.userCreateForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    await handleUserCreation();
  } catch (error) {
    handleError(error);
  }
});

els.aiChatForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    await submitAiPrompt(els.aiPrompt.value);
  } catch (error) {
    handleError(error);
  }
});

els.downloadLastReply.addEventListener("click", () => {
  downloadLastAiReply();
});

els.generateSteering.addEventListener("click", async () => {
  try {
    await generateSteeringFromPrompt(els.aiPrompt.value);
  } catch (error) {
    handleError(error);
  }
});

els.generateSteeringSecondary.addEventListener("click", async () => {
  try {
    await generateSteeringFromPrompt(els.aiPrompt.value);
  } catch (error) {
    handleError(error);
  }
});

els.quickAiButtons.forEach((button) => {
  button.addEventListener("click", () => {
    if (!(button instanceof HTMLButtonElement)) return;
    els.aiPrompt.value = button.dataset.aiPrompt || "";
    els.aiPrompt.focus();
  });
});

els.editorSearch.addEventListener("input", () => renderEditor());
els.editorFilter.addEventListener("change", () => renderEditor());

for (const container of [els.activeActions, els.upcomingActions, els.riskActions, els.editorTable]) {
  container.addEventListener("input", (event) => {
    if (updateTaskFromTarget(event.target)) {
      if (isNotesTarget(event.target)) {
        updateNoteEditorFeedback(event.target);
        return;
      }
      if (event.target instanceof HTMLInputElement && event.target.type === "date") {
        return;
      }
      queueAutoSave(900);
    }
  });

  container.addEventListener("change", (event) => {
    if (updateTaskFromTarget(event.target)) {
      if (isNotesTarget(event.target)) {
        updateNoteEditorFeedback(event.target);
        queueAutoSave(1400);
        return;
      }
      renderWorkspace();
      queueAutoSave(450);
    }
  });

  container.addEventListener("focusout", (event) => {
    if (!isNotesTarget(event.target)) return;
    if (updateTaskFromTarget(event.target)) {
      updateNoteEditorFeedback(event.target);
      queueAutoSave(1400);
    }
  });
}

els.editorTable.addEventListener("click", (event) => {
  const button = event.target instanceof HTMLElement ? event.target.closest("[data-action='delete-plan-row']") : null;
  if (!(button instanceof HTMLButtonElement)) return;
  deletePlanRow(Number(button.dataset.index));
});

window.addEventListener("beforeunload", (event) => {
  if (!state.isDirty) return;
  event.preventDefault();
  event.returnValue = "";
});

async function boot() {
  const storedPage = window.location.hash.replace("#", "") || window.localStorage.getItem(STORAGE_KEYS.page) || "dashboard";
  setCurrentPage(PAGE_CONFIG[storedPage] ? storedPage : "dashboard", false);
  renderWorkspace();
  renderConnectionNotice(
    IS_FILE_MODE
      ? "A aplicacao foi aberta em file://. Os dados e gravacoes passam pelo servidor local em http://127.0.0.1:8000."
      : "",
  );

  const session = await loadSession();
  if (!session) {
    return;
  }
  await hydrateWorkspace();
}

boot().catch(handleError);
