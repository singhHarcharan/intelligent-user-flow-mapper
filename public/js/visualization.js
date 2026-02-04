const startButton = document.getElementById('start-crawl');
const cancelButton = document.getElementById('cancel-crawl');
const statusEl = document.getElementById('status');
const spinnerEl = document.getElementById('spinner');
const flowsEl = document.getElementById('flows');
const summaryEl = document.getElementById('summary');
const toastEl = document.getElementById('toast');
const logPanel = document.getElementById('log-panel');
let currentController = null;

const inputEls = {
  startUrl: document.getElementById('start-url'),
  username: document.getElementById('username'),
  password: document.getElementById('password'),
  authMode: document.getElementById('auth-mode'),
  loginUrl: document.getElementById('login-url'),
  maxDepth: document.getElementById('max-depth'),
  maxPages: document.getElementById('max-pages'),
  timeout: document.getElementById('timeout')
};

function setStatus(message, isError = false) {
  statusEl.textContent = message;
  statusEl.style.color = isError ? '#b91c1c' : '#5b6475';
}

function setLoading(isLoading) {
  if (isLoading) {
    spinnerEl.classList.add('active');
  } else {
    spinnerEl.classList.remove('active');
  }
}

let toastTimeout = null;
function showToast(message) {
  if (!toastEl) return;
  toastEl.textContent = message;
  toastEl.classList.add('show');
  if (toastTimeout) clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => {
    toastEl.classList.remove('show');
  }, 4000);
}

function buildRequestPayload() {
  const credentials = {};
  if (inputEls.username.value.trim()) credentials.username = inputEls.username.value.trim();
  if (inputEls.password.value.trim()) credentials.password = inputEls.password.value.trim();

  const crawlConfig = {
    maxDepth: Number(inputEls.maxDepth.value || 3),
    maxPages: Number(inputEls.maxPages.value || 40),
    timeout: Number(inputEls.timeout.value || 30000),
    authMode: inputEls.authMode.value || 'auto'
  };

  if (inputEls.loginUrl.value.trim()) {
    crawlConfig.loginUrl = inputEls.loginUrl.value.trim();
  }

  return {
    startUrl: inputEls.startUrl.value.trim(),
    credentials: Object.keys(credentials).length ? credentials : undefined,
    crawlConfig
  };
}

function renderSummary(metadata) {
  summaryEl.innerHTML = '';
  if (!metadata) return;

  const pills = [
    `Pages: ${metadata.totalPages ?? 0}`,
    `Flows: ${metadata.totalFlows ?? 0}`,
    `Generated: ${new Date(metadata.generatedAt).toLocaleString()}`
  ];

  pills.forEach(text => {
    const pill = document.createElement('div');
    pill.className = 'pill';
    pill.textContent = text;
    summaryEl.appendChild(pill);
  });
}

function renderFlows(flows) {
  flowsEl.innerHTML = '';

  if (!flows || flows.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'helper';
    empty.textContent = 'No flows found. Try increasing max depth or max pages.';
    flowsEl.appendChild(empty);
    return;
  }

  flows.forEach(flow => {
    const card = document.createElement('div');
    card.className = 'flow-card';

    const header = document.createElement('div');
    header.className = 'flow-header';

    const title = document.createElement('div');
    title.className = 'flow-title';
    title.textContent = flow.name || `${flow.type || 'flow'} flow`;

    const meta = document.createElement('div');
    meta.className = 'flow-meta';
    meta.textContent = `Score ${flow.score ?? 0} • ${flow.stepCount ?? flow.steps?.length ?? 0} steps`;

    header.appendChild(title);
    header.appendChild(meta);

    const stepsRow = document.createElement('div');
    stepsRow.className = 'flow-steps';

    (flow.steps || []).forEach((step, index) => {
      if (index > 0) {
        const arrow = document.createElement('span');
        arrow.className = 'arrow';
        arrow.textContent = '→';
        stepsRow.appendChild(arrow);
      }

      const stepEl = document.createElement('div');
      stepEl.className = 'step';
      stepEl.textContent = step.label || step.title || step.url;
      stepsRow.appendChild(stepEl);
    });

    card.appendChild(header);
    card.appendChild(stepsRow);
    flowsEl.appendChild(card);
  });
}

let currentJobId = null;
let logInterval = null;

function renderLogs(logs) {
  if (!logPanel) return;
  logPanel.innerHTML = '';
  logs.slice(-200).forEach(item => {
    const line = document.createElement('div');
    line.className = 'log-line';
    const time = document.createElement('span');
    time.className = 'log-time';
    time.textContent = new Date(item.ts).toLocaleTimeString();
    const msg = document.createElement('span');
    msg.textContent = item.message;
    line.appendChild(time);
    line.appendChild(msg);
    logPanel.appendChild(line);
  });
  logPanel.scrollTop = logPanel.scrollHeight;
}

async function pollLogs() {
  if (!currentJobId) return;
  try {
    const response = await fetch(`/api/job-logs/${currentJobId}`);
    if (!response.ok) {
      if (logPanel && logPanel.innerHTML.trim() === '') {
        logPanel.innerHTML = '<div class="log-line"><span class="log-time">--:--:--</span><span>Waiting for server logs…</span></div>';
      }
      return;
    }
    const data = await response.json();
    renderLogs(data.logs || []);
    if (data.done && logInterval) {
      clearInterval(logInterval);
      logInterval = null;
    }
  } catch (error) {
    // Ignore log polling errors
  }
}

async function handleCrawl() {
  const payload = buildRequestPayload();
  if (!payload.startUrl) {
    setStatus('Please enter a valid start URL.', true);
    return;
  }

  startButton.disabled = true;
  cancelButton.disabled = false;
  setLoading(true);
  setStatus('Crawling and extracting flows… this can take a moment.');
  flowsEl.innerHTML = '';
  summaryEl.innerHTML = '';
  if (logPanel) logPanel.innerHTML = '';

  try {
    currentJobId = window.crypto?.randomUUID ? window.crypto.randomUUID() : `job-${Date.now()}`;
    payload.jobId = currentJobId;
    currentController = new AbortController();
    if (logInterval) clearInterval(logInterval);
    await pollLogs();
    logInterval = setInterval(pollLogs, 1000);
    const response = await fetch('/api/extract-flows', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: currentController.signal
    });

    if (!response.ok) {
      const error = await response.json();
      const detail = error?.message || error?.error || 'Request failed';
      if (response.status === 409 && error?.error === 'Crawl cancelled') {
        setStatus('Crawl cancelled by user.', true);
        showToast('Crawl cancelled.');
        return;
      }
      showToast(`Crawl failed: ${detail}`);
      throw new Error(detail);
    }

    const data = await response.json();
    renderSummary(data.metadata);
    renderFlows(data.flows);
    setStatus('Flows ready. Scroll to review the detected journeys.');
  } catch (error) {
    console.error(error);
    if (error.name === 'AbortError') {
      setStatus('Crawl cancelled by user.', true);
      showToast('Crawl cancelled.');
    } else {
      setStatus(`Failed to extract flows: ${error.message}`, true);
      showToast(`Failed: ${error.message}`);
    }
  } finally {
    setLoading(false);
    startButton.disabled = false;
    cancelButton.disabled = true;
    currentController = null;
    currentJobId = null;
    if (logInterval) {
      clearInterval(logInterval);
      logInterval = null;
    }
  }
}

startButton.addEventListener('click', handleCrawl);
cancelButton.addEventListener('click', () => {
  if (currentController) {
    currentController.abort();
    if (currentJobId) {
      fetch('/api/cancel-crawl', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jobId: currentJobId })
      }).catch(() => {});
    }
  }
});
