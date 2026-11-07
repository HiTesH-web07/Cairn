'use client';
// How we score: a plain explanation built from this workspace's live settings, with a small try-it calculator.
import { useState } from 'react';
import { useApp } from '@/components/AppState';
import { Head } from '@/components/ui';

const RANK_NAME = ['Most important', 'Very important', 'Important', 'Useful', 'Nice to have'];
const EX = [['Launch the new feature', 'done_well'], ['Write the help page', 'done_well'], ['Fix the login bug', 'needs_fixes']];
const LABEL = { done_well: 'Done well', needs_fixes: 'Needs fixes', redo: 'Redo' };
const TONE = { done_well: 'good', needs_fixes: 'warn', redo: 'bad' };
const Check = () => <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12.5 4.5 4.5L19 7.5" /></svg>;
const Cross = () => <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg>;
// A number that replays its little "bump" animation whenever it changes.
const Bump = ({ value, ...rest }) => <b key={value} className="bump" {...rest}>{value}</b>;

export default function HowPage() {
  const { me } = useApp();
  const s = me.settings;
  const W = s.rankWeights; const Q = s.quality; const pct = (n) => `${Math.round(n * 100)}%`;
  const maxW = Math.max(...W);
  const [picked, setPicked] = useState(EX.map((e) => e[1]));

  let earned = 0, poss = 0;
  const pts = EX.map((_, i) => { const p = Math.round(W[i] * Q[picked[i]] * 10) / 10; earned += p; poss += W[i]; return p; });
  const earnedR = Math.round(earned * 10) / 10;
  const score = poss ? Math.min(100, Math.round((earned / poss) * 100)) : 0;

  return (
    <>
      <Head eyebrow="Reference" title="How we score" sub="A short, plain explanation. Anyone can read it, and the numbers come from this workspace's live settings." />
      <section className="how-hero"><div className="how-q">Your weekly score is</div>
        <h2 className="how-big">how much of your plan you delivered, and how well.</h2>
        <div className="how-eq" aria-label="Score equals points earned divided by points possible times 100"><span><b>Points you earned</b><small>from the work you delivered</small></span><i>÷</i><span><b>Points your plan was worth</b><small>your manager&apos;s top {W.length}</small></span><i>× 100</i></div>
        <p className="how-note"><b>The number of tasks never counts.</b> Doing 50 small things does not beat doing one thing that mattered.</p>
      </section>

      <h2>How a week works</h2>
      <div className="how-steps">
        <div className="how-step"><span className="n">1</span><h3>Plan</h3><p>At the start of the week, your manager picks your top {W.length} pieces of work and puts them in order.</p></div>
        <div className="how-step"><span className="n">2</span><h3>Deliver</h3><p>You do the work and mark it delivered, with a link or a note as proof.</p></div>
        <div className="how-step"><span className="n">3</span><h3>Rate</h3><p>Someone who used the work rates it. Ranks #1{s.secondRaterRanks > 1 ? ` to #${s.secondRaterRanks}` : ''} get a second opinion.</p></div>
        <div className="how-step"><span className="n">4</span><h3>Score</h3><p>The points add up into one number out of 100. Always the same formula.</p></div>
      </div>

      <h2>What each priority is worth</h2>
      <div className="card"><p className="small muted" style={{ marginTop: 0 }}>The higher a piece of work is in your list, the more of your score it carries. Everyone&apos;s list has its own #1, so a new joiner and a team lead are both scored out of 100.</p>
        <div className="how-bars">{W.map((w, i) => (
          <div className="how-bar" key={i}><b className={`how-rk${i === 0 ? ' r1' : ''}`}>#{i + 1}</b><div><div className="lab"><span>{RANK_NAME[i] || 'Priority'}</span><em>{w}%</em></div><div className="track"><i style={{ width: `${(w / maxW) * 100}%` }} /></div></div></div>
        ))}</div>
      </div>

      <h2>How well it was done</h2>
      <div className="how-q3">
        <div className="how-card good"><span className="dot" /><h3>Done well</h3><b>{pct(Q.done_well)} of the points</b><p>It worked and it did the job.</p></div>
        <div className="how-card warn"><span className="dot" /><h3>Needs fixes</h3><b>{pct(Q.needs_fixes)} of the points</b><p>Mostly there, a few things to fix. The rater says what.</p></div>
        <div className="how-card bad"><span className="dot" /><h3>Redo</h3><b>{pct(Q.redo)} of the points</b><p>It missed the brief. The rater says why.</p></div>
      </div>

      <h2>Try it yourself</h2>
      <div className="card how-try" id="howTry"><p className="small muted" style={{ marginTop: 0 }}>Three priorities for one week. Tap a rating and watch the score.</p>
        <div className="how-rows">{EX.map((e, i) => (
          <div className="how-row" data-i={i} key={i}><b className={`how-rk${i === 0 ? ' r1' : ''}`}>#{i + 1}</b><div className="t"><span>{e[0]}</span><small>worth {W[i]} points</small></div>
            <div className="opts" role="group" aria-label={`Rating for ${e[0]}`}>
              {['done_well', 'needs_fixes', 'redo'].map((q) => (
                <button type="button" key={q} className={`q q-${TONE[q]}${picked[i] === q ? ' on' : ''}`} data-q={q} aria-pressed={picked[i] === q} onClick={() => setPicked((p) => p.map((x, k) => (k === i ? q : x)))}><i />{LABEL[q]}</button>
              ))}
            </div>
            <div className="pts" data-pts>+{pts[i]}</div>
          </div>
        ))}</div>
        <div className="how-result">
          <div><small>Points earned</small><Bump value={earnedR} data-earn /><span>of <em data-poss>{poss}</em></span></div>
          <div className="how-sc"><small>Weekly score</small><Bump value={score} data-score /><span>/ 100</span></div>
        </div>
      </div>

      <h2>What counts, and what never does</h2>
      <div className="how-two">
        <div className="card"><h3>Helps your score</h3><ul className="how-list yes">
          <li><Check />Finishing your top priorities</li><li><Check />Doing them well, as rated by others</li><li><Check />A stretch task above your level: +{pct(s.stretchBonus)} if done well</li></ul></div>
        <div className="card"><h3>Never lowers it</h3><ul className="how-list no">
          <li><Check />Work blocked by someone else</li><li><Check />A missed stretch task</li><li><Check />Leave days: less is expected that week</li><li><Check />Being given only small tasks</li></ul></div>
        <div className="card"><h3>Never counts</h3><ul className="how-list none">
          <li><Cross />How many tasks you did</li><li><Cross />Hours worked, screenshots or activity tracking</li><li><Cross />Work that was not in your top {W.length}. It is logged, not scored</li><li><Cross />AI. It never scores anyone</li></ul></div>
      </div>

      <h2>Common questions</h2>
      <div className="how-faq">
        <details><summary>What if I only got small tasks this week?</summary><p>Nothing is lost. The score compares what you delivered with <b>your own plan</b>. If you delivered every small task well, you score 100. Managers also see the level of work in the Team view.</p></details>
        <details><summary>What if I disagree with a rating?</summary><p>Raise a dispute from the rating. The rater&apos;s manager decides. Both opinions and the decision are kept, so nothing is hidden.</p></details>
        <details><summary>Can my manager change my priorities during the week?</summary><p>Yes, but the week is locked once it starts. A change needs a written reason, and it is recorded in the history log for everyone to see.</p></details>
        <details><summary>What are coins?</summary><p>Thank-yous from colleagues. Everyone has {s.coinsPerWeek} a week, up to {s.maxCoinsPerPerson} for one person, never to themselves. They show beside your score and <b>never change it</b>.</p></details>
        <details><summary>Who can see my score?</summary><p>You, your manager and the people above them. Colleagues at your level cannot see it. Raters&apos; habits (how often they say Done well) are visible to managers, so harsh or soft raters show up.</p></details>
      </div>
    </>
  );
}
