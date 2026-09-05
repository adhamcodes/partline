window.__consoleErrors = [];
window.__consoleWarnings = [];
const nativeWarn = console.warn.bind(console);
console.warn = (...items) => { window.__consoleWarnings.push(items.map(String).join(' ')); nativeWarn(...items); };
window.addEventListener('error', event => window.__consoleErrors.push(String(event.message || 'window error')));
window.addEventListener('unhandledrejection', event => window.__consoleErrors.push(String(event.reason || 'unhandled rejection')));

const $ = selector => document.querySelector(selector);
const create = (tag, className, text) => {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
};
const outcomeText = value => ({ meets_requirements: 'Qualifies', needs_verification: 'Verify', does_not_meet: 'Rejected' }[value] || value);

let model;
let replayTimer;

function renderLanes(suppliers, stage = 5) {
  const board = $('#supplier-lanes');
  board.replaceChildren();
  suppliers.forEach((supplier, index) => {
    const lane = create('article', 'lane');
    const activeTargets = model.operations.replay[stage].targets;
    lane.dataset.active = String(activeTargets.includes(supplier.id));
    lane.dataset.outcome = supplier.outcome;
    let phase = 'queued';
    let label = 'Queued';
    let coverage = 0;
    if (stage >= 1 && index < 2) { phase = 'active'; label = 'Connected'; }
    if (stage >= 2 && index < 2) { phase = 'evidence'; label = 'Evidence arriving'; coverage = Math.min(supplier.coverage, 63); }
    if (stage >= 3) { phase = supplier.id === 'cedar' ? 'gap' : 'evidence'; label = supplier.id === 'cedar' ? 'No answer' : supplier.id === 'beacon' ? 'Gap detected' : 'Parsed'; coverage = supplier.id === 'beacon' ? 75 : supplier.coverage; }
    if (stage >= 4 && supplier.id === 'beacon') { phase = 'clarify'; label = 'Clarified'; coverage = 100; }
    if (stage >= 4 && index >= 2) { phase = supplier.id === 'delta' ? 'rejected' : 'gap'; label = supplier.id === 'delta' ? 'Model mismatch' : 'No answer'; coverage = supplier.coverage; }
    if (stage >= 5) { phase = supplier.outcome === 'does_not_meet' ? 'rejected' : supplier.outcome === 'needs_verification' ? 'gap' : 'complete'; label = outcomeText(supplier.outcome); coverage = supplier.coverage; }
    lane.dataset.phase = phase;
    lane.style.setProperty('--coverage', `${coverage}%`);
    const top = create('div', 'lane-top');
    top.append(create('span', 'lane-name', supplier.name.replace(' (fictional)', '')), create('span', 'lane-seq', `0${index + 1}`));
    lane.append(top, create('div', 'lane-status', label));
    const meter = create('div', 'lane-meter'); meter.append(create('i'));
    lane.append(meter, create('small', '', `${coverage}% evidence · ${supplier.attempts} attempt${supplier.attempts === 1 ? '' : 's'}`));
    board.append(lane);
  });
}

function openEvidence(title, evidence, summary) {
  $('#evidence-title').textContent = title;
  $('#evidence-summary').textContent = summary;
  const list = $('#evidence-list'); list.replaceChildren();
  if (!evidence.length) list.append(create('p', 'muted', 'No supplier transcript evidence was recovered.'));
  evidence.forEach(item => {
    const article = create('article', 'evidence-item');
    const meta = create('div', 'evidence-meta');
    meta.append(create('strong', '', item.field.replace('_', ' ')), create('span', '', item.value), create('span', '', item.source), create('span', '', item.sourceRef), create('span', '', item.timestamp));
    const quote = create('blockquote', '', item.quote);
    article.append(meta, quote); list.append(article);
  });
  $('#evidence-dialog').showModal();
}

function renderTable(suppliers) {
  const body = $('#supplier-table'); body.replaceChildren();
  suppliers.forEach(supplier => {
    const row = document.createElement('tr');
    const name = create('td', 'supplier-cell'); name.append(create('strong', '', supplier.name.replace(' (fictional)', '')), create('small', '', supplier.clarification === 'completed' ? 'Targeted clarification completed' : supplier.reasons[0] || 'Complete evidence set'));
    const call = create('td'); call.append(create('span', `status-tag ${supplier.callState === 'COMPLETED' ? 'exact' : 'unknown'}`, supplier.callState.replace('_', ' ')));
    const compatibility = create('td'); compatibility.append(create('span', `status-tag ${supplier.compatibility}`, supplier.compatibility === 'exact' ? 'Exact match' : supplier.compatibility));
    const total = create('td', '', supplier.total);
    const ready = create('td', '', supplier.ready);
    const coverageCell = create('td'); const coverage = create('div', 'coverage'); const bar = create('b'); const fill = create('i'); fill.style.width = `${supplier.coverage}%`; bar.append(fill); coverage.append(bar, create('span', '', `${supplier.coverage}%`)); coverageCell.append(coverage);
    const result = create('td'); result.append(create('span', `status-tag ${supplier.outcome}`, outcomeText(supplier.outcome)));
    const action = create('td'); const inspect = create('button', 'evidence-button', supplier.evidence.length ? 'Inspect evidence' : 'Inspect gap'); inspect.type = 'button'; inspect.addEventListener('click', () => openEvidence(supplier.name, supplier.evidence, `${supplier.coverage}% evidence coverage · ${supplier.reasons.join(' · ') || 'all required fields supported'}`)); action.append(inspect);
    row.append(name, call, compatibility, total, ready, coverageCell, result, action); body.append(row);
  });
}

function renderTimeline(timeline) {
  const root = $('#timeline'); root.replaceChildren();
  const axisLabel = create('div', 'timeline-label timeline-axis-label', 'SUPPLIER');
  const axis = create('div', 'timeline-track timeline-axis');
  timeline.ticks.forEach(sequence => {
    const tick = create('span', 'timeline-tick', `E${String(sequence).padStart(2, '0')}`);
    tick.style.left = `${((sequence - 1) / Math.max(1, timeline.maxSequence - 1)) * 100}%`;
    axis.append(tick);
  });
  root.append(axisLabel, axis);
  timeline.lanes.forEach(lane => {
    root.append(create('div', 'timeline-label', lane.name));
    const track = create('div', 'timeline-track');
    lane.segments.forEach(segment => {
      const bar = create('span', `timeline-segment ${segment.round > 0 ? 'clarification' : ''}`.trim(), segment.round > 0 ? 'CLARIFY' : 'CALL');
      const denominator = Math.max(1, timeline.maxSequence - 1);
      bar.style.left = `${((segment.start - 1) / denominator) * 100}%`;
      bar.style.width = `${Math.max(2.5, ((segment.end - segment.start) / denominator) * 100)}%`;
      bar.title = `${lane.name} · ${segment.label} · E${String(segment.start).padStart(2, '0')}–E${String(segment.end).padStart(2, '0')} · ${segment.outcome}`;
      bar.setAttribute('aria-label', bar.title);
      track.append(bar);
    });
    root.append(track);
  });
}

function renderRealProof(proof) {
  $('#summary-calls').textContent = String(proof.callCount);
  $('#summary-redials').textContent = proof.startAttempts === proof.callCount ? 'ZERO' : String(Math.max(0, proof.startAttempts - proof.callCount));
  $('#summary-fields').textContent = `${proof.fields.filter(item => item.state === 'supported').length} / ${proof.fields.length}`;
  $('#summary-clarification').textContent = proof.sameCallClarification ? 'SAME CALL' : 'NOT EVIDENCED';
  $('#proof-status').textContent = proof.status;
  $('#proof-calls').textContent = `${proof.callCount} · no redial`;
  $('#proof-coverage').textContent = `${proof.coverage}% · 7/8`;
  $('#proof-clarification').textContent = proof.sameCallClarification ? 'Warranty · same call' : 'Not evidenced';
  $('#proof-deadline').textContent = proof.deadlineLabel;
  const grid = $('#real-fields'); grid.replaceChildren();
  proof.fields.forEach(item => {
    const field = create('div', `field ${item.state === 'supported' ? '' : 'unknown'}`.trim());
    field.append(create('span', '', item.label), create('strong', '', item.value), create('small', '', item.state === 'supported' ? `${item.evidenceIds.length} source span` : 'Not stated'));
    grid.append(field);
  });
  $('#real-evidence').addEventListener('click', () => openEvidence('Beacon Supply · real CALL-E proof', proof.evidence, `${proof.coverage}% supported · ${proof.unknownFields.join(', ')} remains unknown · personal identifiers excluded`));
}

function setReplayStage(stage) {
  const item = model.operations.replay[stage];
  $('#replay-count').textContent = `0${stage + 1} / 0${model.operations.replay.length}`;
  $('#replay-stage-title').textContent = item.label;
  $('#replay-stage-detail').textContent = item.detail;
  document.documentElement.style.setProperty('--replay-progress', String((stage + 1) / model.operations.replay.length));
  renderLanes(model.operations.suppliers, stage);
}

function startReplay() {
  clearInterval(replayTimer);
  let stage = 0;
  $('#replay').disabled = true;
  $('#replay').textContent = 'Replaying evidence flow…';
  setReplayStage(stage);
  replayTimer = setInterval(() => {
    stage += 1;
    setReplayStage(stage);
    if (stage === model.operations.replay.length - 1) {
      clearInterval(replayTimer);
      $('#replay').disabled = false;
      $('#replay').textContent = 'Replay 6-second run';
    }
  }, 950);
}

function render(data) {
  model = data;
  $('#incident-request').textContent = data.incident.request;
  $('#model').textContent = data.incident.model;
  $('#quantity').textContent = `${data.incident.quantity} units`;
  $('#deadline').textContent = data.incident.deadlineLabel;
  $('#fulfillment').textContent = data.incident.fulfillment;
  $('#comparison-summary').textContent = `${data.operations.supplierCount} suppliers · ${data.operations.maxConcurrency} concurrent · ${data.operations.callRecords} call records`;
  renderTimeline(data.operations.timeline);
  renderLanes(data.operations.suppliers);
  renderTable(data.operations.suppliers);
  const recommendation = data.operations.recommendation;
  if (recommendation) {
    $('#recommendation-title').textContent = recommendation.name.replace(' (fictional)', '');
    $('#recommendation-price').textContent = recommendation.total;
    $('#recommendation-savings').textContent = recommendation.savings;
    recommendation.basis.forEach(item => $('#recommendation-basis').append(create('li', '', item)));
    if (recommendation.rejectedAlternative) {
      const rejected = recommendation.rejectedAlternative;
      $('#rejected-alternative').append(
        create('span', '', 'CHEAPEST IS NOT QUALIFYING'),
        create('strong', '', `${rejected.name} · ${rejected.total}`),
        create('small', '', rejected.reason),
      );
    }
  }
  renderRealProof(data.realProof);
  $('#safety-decision').textContent = data.safety.decision;
  $('#replay').addEventListener('click', startReplay);
  $('#close-dialog').addEventListener('click', () => $('#evidence-dialog').close());
  $('#evidence-dialog').addEventListener('click', event => { if (event.target === $('#evidence-dialog')) $('#evidence-dialog').close(); });
  window.__PARTLINE_READY__ = true;
}

const dashboardData = window.__PARTLINE_DATA__
  ? Promise.resolve(window.__PARTLINE_DATA__)
  : fetch('/api/dashboard').then(response => {
      if (!response.ok) throw new Error('dashboard request failed');
      return response.json();
    });

dashboardData.then(render).catch(error => {
  window.__consoleErrors.push(String(error.message || error));
  $('#fatal-error').hidden = false;
});
