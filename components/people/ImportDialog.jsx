'use client';
// The body of a CSV import dialog: template download, file pick and a dry-run preview.
// The rows read from the file are shared with the dialog's submit through `store`.
import { useState } from 'react';
import { api, downloadCsv, idem, parseCsv } from '@/lib/client';

export function openImport(modal, o) {
  const store = { rows: [] };
  modal(<ImportBody o={o} store={store} />, async () => {
    if (!store.rows.length) throw new Error('Choose a CSV file first');
    const res = await api('POST', o.endpoint, { rows: store.rows }, { idem: idem() });
    if (!res.ok) throw new Error(res.errors.slice(0, 8).map((e) => `Line ${e.line} (${e.email}): ${e.errors.join(', ')}`).join(' · '));
    o.done(res);
  }, { submitLabel: 'Import' });
}

function ImportBody({ o, store }) {
  const [preview, setPreview] = useState(null);
  const onFile = async (e) => {
    const f = e.target.files[0];
    if (!f) return;
    if (f.size > 2e6) { setPreview('File is too big (max 2 MB).'); return; }
    store.rows = parseCsv(await f.text()).map(o.pick);
    const n = store.rows.length;
    setPreview(`${n} rows read. Checking…`);
    if (o.noDryRun) { setPreview(`${n} rows ready to import.`); return; }
    try {
      const chk = await api('POST', o.endpoint, { rows: store.rows, dryRun: true });
      setPreview(chk.ok
        ? <>Ready: <b>{chk.new}</b> new, <b>{chk.updated}</b> updated. Nothing is saved until you click Import.</>
        : <><span className="err">{chk.errors.length} problem(s) to fix in the file:</span>{chk.errors.slice(0, 10).map((x, k) => <span key={k}><br />Line {x.line} {x.email}: {x.errors.join(', ')}</span>)}</>);
    } catch (err) { setPreview(err.message); }
  };
  return (
    <>
      <h3>{o.title}</h3><p className="small">{o.help}</p>
      <button type="button" id="tpl" onClick={() => downloadCsv(`${o.endpoint.split('/')[2]}-template.csv`, o.template)}>Download a template</button>
      <label>CSV file</label><input type="file" id="csvfile" accept=".csv,text/csv" onChange={onFile} />
      <div id="preview" className="small muted">{preview}</div>
    </>
  );
}
