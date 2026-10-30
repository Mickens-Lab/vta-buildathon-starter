/** Scoped styles; injected once by mountStatusPanel. Theme-aware via prefers-color-scheme. */
export const CSS = `
.sp-root{--sp-bg:#f6f7f9;--sp-card:#fff;--sp-fg:#1b1f24;--sp-mute:#5b6572;--sp-line:#dde1e7;--sp-accent:#2557d6;
--sp-ok:#12703a;--sp-ok-bg:#dff3e7;--sp-warn:#8a5a00;--sp-warn-bg:#fdefc9;--sp-bad:#b3201f;--sp-bad-bg:#fbdedd;--sp-unk:#4a5563;--sp-unk-bg:#e8ebf0;--sp-code:#eef0f4;
font:15px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif;color:var(--sp-fg);background:var(--sp-bg);padding:1rem;border-radius:12px;box-sizing:border-box}
@media (prefers-color-scheme:dark){.sp-root{--sp-bg:#14171c;--sp-card:#1d2128;--sp-fg:#e6e9ee;--sp-mute:#9aa4b2;--sp-line:#2d333c;--sp-accent:#7fa3ff;
--sp-ok:#6fd49a;--sp-ok-bg:#16301f;--sp-warn:#f0c55a;--sp-warn-bg:#35290b;--sp-bad:#ff8d8a;--sp-bad-bg:#3b1716;--sp-unk:#b3bcc9;--sp-unk-bg:#2a303a;--sp-code:#12151a}}
.sp-root *{box-sizing:border-box}
.sp-root a{color:var(--sp-accent)}
.sp-bar{display:flex;flex-wrap:wrap;gap:.5rem .75rem;align-items:center;margin-bottom:.75rem}
.sp-bar h1,.sp-bar h2.sp-title{font-size:1.25rem;margin:0;flex:1 1 12rem}
.sp-root button,.sp-root select{font:inherit;color:var(--sp-fg);background:var(--sp-card);border:1px solid var(--sp-line);border-radius:8px;padding:.3rem .7rem;cursor:pointer}
.sp-root button:hover{border-color:var(--sp-accent)}
.sp-root button:disabled{opacity:.55;cursor:default}
.sp-stamp{color:var(--sp-mute);font-size:.85rem}
.sp-banner{border:1px solid var(--sp-warn);background:var(--sp-warn-bg);color:var(--sp-warn);border-radius:10px;padding:.55rem .8rem;margin-bottom:.75rem;font-size:.92rem}
.sp-banner b{font-weight:650}
.sp-banner a{color:inherit}
.sp-grid{display:grid;gap:.75rem;grid-template-columns:repeat(auto-fit,minmax(min(100%,26rem),1fr))}
.sp-card{background:var(--sp-card);border:1px solid var(--sp-line);border-radius:12px;padding:.75rem .9rem;min-width:0}
.sp-card h2{font-size:1rem;margin:0 0 .4rem;display:flex;gap:.5rem;align-items:center}
.sp-row{display:flex;gap:.6rem;padding:.4rem 0;border-top:1px solid var(--sp-line);align-items:flex-start}
.sp-row:first-of-type{border-top:0}
.sp-pill{flex:0 0 4.4rem;text-align:center;font-size:.72rem;font-weight:700;letter-spacing:.03em;text-transform:uppercase;border-radius:999px;padding:.12rem .4rem;margin-top:.12rem;white-space:nowrap}
.sp-ok{color:var(--sp-ok);background:var(--sp-ok-bg)}.sp-warn{color:var(--sp-warn);background:var(--sp-warn-bg)}
.sp-bad{color:var(--sp-bad);background:var(--sp-bad-bg)}.sp-info{color:var(--sp-mute);background:transparent;border:1px solid var(--sp-line)}.sp-unknown{color:var(--sp-unk);background:var(--sp-unk-bg)}
.sp-body{min-width:0;flex:1}
.sp-label{font-weight:600}
.sp-val{overflow-wrap:anywhere}
.sp-note{color:var(--sp-mute);font-size:.88rem;overflow-wrap:anywhere}
.sp-fix{font-size:.88rem;margin-top:.15rem;overflow-wrap:anywhere}
.sp-fix::before{content:"Fix: ";font-weight:650}
.sp-root code,.sp-root pre{font:12.5px/1.45 ui-monospace,SFMono-Regular,Menlo,monospace;background:var(--sp-code);border-radius:6px}
.sp-root code{padding:.05rem .3rem;overflow-wrap:anywhere}
.sp-root pre{padding:.6rem;overflow:auto;max-height:22rem;margin:.4rem 0 0}
.sp-root details{margin-top:.35rem}
.sp-root summary{cursor:pointer;color:var(--sp-mute);font-size:.88rem}
.sp-chips{display:flex;flex-wrap:wrap;gap:.3rem;margin-top:.2rem}
.sp-chip{background:var(--sp-unk-bg);color:var(--sp-unk);border-radius:6px;padding:.05rem .45rem;font-size:.82rem}
.sp-list{margin:.3rem 0 0;padding-left:1.1rem;font-size:.88rem;color:var(--sp-mute)}
.sp-bar .sp-pill{flex:0 0 auto;padding:.12rem .7rem}.sp-sum{margin-left:auto;flex:0 0 auto}
@media (max-width:480px){.sp-pill{flex-basis:3.6rem}.sp-bar .sp-pill{flex:0 0 auto}.sp-root{padding:.6rem}}
`;
