/* LaunchPoint refresh health; saved predictions and grades stay untouched. */
(function () {
  function prettyDate(value) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value || '')) return 'the previous slate';
    return new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', month: 'short', day: 'numeric' }).format(new Date(value + 'T12:00:00Z'));
  }
  function describeStatus(status) {
    const day = prettyDate(status.slate_date);
    const saved = prettyDate(status.published_slate_date);
    const retained = status.published_slate_date ? ` Saved picks and results from ${saved} remain available.` : '';
    switch (status.state) {
      case 'NO_GAMES': return `No MLB games scheduled for ${day}.${retained}`;
      case 'SLATE_FINISHED': return `${day}'s slate has ended.${retained}`;
      case 'FAILED': return `The latest refresh did not finish.${retained}`;
      case 'REFRESH_PENDING': return `${status.playable_games} game${status.playable_games === 1 ? '' : 's'} awaiting updated ${day} predictions.${retained}`;
      case 'UPDATED': return `${day}'s predictions have refreshed. ${status.playable_games} game${status.playable_games === 1 ? '' : 's'} still playable.`;
      default: return 'Refresh status is being checked. Saved predictions remain available.';
    }
  }
  if (typeof module !== 'undefined') module.exports = { describeStatus };
  if (typeof document === 'undefined') return;
  const panel = document.createElement('section');
  panel.id = 'launchpoint-refresh-status';
  panel.setAttribute('aria-label', 'LaunchPoint refresh status');
  panel.setAttribute('role', 'status');
  panel.style.cssText = 'box-sizing:border-box;margin:12px auto;padding:14px 18px;max-width:1180px;border:1px solid #244227;border-radius:12px;background:#081008;color:#f4f7f2;font:16px/1.5 Arial,sans-serif;';
  const message = document.createElement('strong');
  const checked = document.createElement('div');
  checked.style.cssText = 'color:#b8c6b7;font-size:14px;margin-top:4px;';
  panel.append(message, checked);
  document.body.prepend(panel);
  message.textContent = 'Checking LaunchPoint refresh status…';
  async function update() {
    try {
      const response = await fetch('data/refresh_status.json?check=' + Date.now(), { cache: 'no-store' });
      if (!response.ok) throw new Error('Status unavailable');
      const status = await response.json();
      message.textContent = describeStatus(status);
      const timestamp = new Date(status.schedule_checked_at_utc);
      checked.textContent = Number.isFinite(timestamp.getTime()) ? 'Schedule checked ' + new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' }).format(timestamp) : '';
    } catch {
      message.textContent = 'Refresh status unavailable. Saved predictions and results remain available.';
      checked.textContent = '';
    }
  }
  update();
  document.addEventListener('visibilitychange', () => { if (!document.hidden) update(); });
  window.setInterval(() => { if (!document.hidden) update(); }, 10 * 60 * 1000);
})();
