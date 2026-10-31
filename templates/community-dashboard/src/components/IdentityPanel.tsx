// "Identity": this page's applicant DID decoded (keys, services, the mediator it names) beside the mediator's DID document read from
// its did.jsonl. Read-only and collapsed by default; the mediator document is fetched only when the section is opened. Words and
// decoding live in ../identity.ts (unit-tested). Only public keys are shown.
import { useState } from "react";
import type { ApplicantKind, RunMode } from "../delivery.ts";
import { applicantLine, decodeApplicantDid, mediatorGate, readMediatorDoc, type KeyRow, type MediatorRead, type ServiceRow } from "../identity.ts";

export interface IdentityPanelProps {
  mode: RunMode;
  /** This page's applicant DID; undefined when there is no app credential. */
  did?: string;
  applicant: { kind: ApplicantKind; mediatorDid: string | null; why?: string };
  origin: string;
  /** Injected in tests; defaults to the browser fetch of the mediator's did.jsonl. */
  read?: (mediatorDid: string, origin: string) => Promise<MediatorRead>;
}

function Keys({ keys }: { keys: KeyRow[] }) {
  if (!keys.length) return null;
  return (
    <ul className="small-text" aria-label="Keys">
      {keys.map((k) => <li key={k.id}><code>{k.id}</code> {k.type}, {k.purposes.join(", ")}: <code className="wrap">{k.publicKey}</code></li>)}
    </ul>
  );
}

function Services({ services }: { services: ServiceRow[] }) {
  if (!services.length) return <p className="muted small-text">No services.</p>;
  return (
    <ul className="small-text" aria-label="Services">
      {services.map((s, i) => <li key={s.id ?? i}>{s.id && <><code>{s.id}</code> </>}{s.type}: <code className="wrap">{s.endpoint}</code></li>)}
    </ul>
  );
}

export function IdentityPanel({ mode, did, applicant, origin, read = readMediatorDoc }: IdentityPanelProps) {
  const [med, setMed] = useState<MediatorRead | "reading">();
  const gate = mediatorGate(mode, applicant.mediatorDid);
  const decoded = did ? decodeApplicantDid(did) : undefined;

  async function load() {
    if (!gate.did) return;
    setMed("reading");
    setMed(await read(gate.did, origin));
  }

  return (
    <details className="card identity" aria-label="Identity" onToggle={(e) => { if ((e.currentTarget as HTMLDetailsElement).open && med === undefined) void load(); }}>
      <summary><b>Identity</b> <span className="muted small-text">{decoded ? decoded.method : "no app credential"}{gate.did ? " and the mediator's DID document" : ""}</span></summary>
      <h3 className="small-heading">This page's applicant</h3>
      <p className="small-text">{applicantLine(applicant.kind, applicant.why)}</p>
      {!decoded ? <p className="muted">No app credential, so there is no applicant DID. Run <code>npm run up</code> at the repo root, then restart the dev server.</p> : (
        <>
          <p className="small-text"><code className="wrap">{decoded.did}</code></p>
          <p className="muted small-text">{decoded.note}</p>
          {decoded.error && <p className="note bad small-text">{decoded.error}</p>}
          <Keys keys={decoded.keys} />
          {decoded.method === "did:peer:2" && <Services services={decoded.services} />}
          {decoded.mediatorDid && <p className="small-text">Mediator named by the TSPTransport service: <code className="wrap">{decoded.mediatorDid}</code>{applicant.mediatorDid && decoded.mediatorDid !== applicant.mediatorDid ? " (not the mediator in .vta/tunnel.json)" : ""}</p>}
        </>
      )}
      <h3 className="small-heading">The mediator's DID document</h3>
      <p className="muted small-text">{gate.text}</p>
      {gate.did && (
        <>
          <p className="small-text"><code className="wrap">{gate.did}</code></p>
          {med === "reading" && <p className="muted small-text">Reading its did.jsonl...</p>}
          {med && med !== "reading" && !med.ok && <p className="note warn small-text" role="alert" style={{ whiteSpace: "pre-wrap" }}>{med.text}</p>}
          {med && med !== "reading" && med.ok && (
            <>
              <p className="muted small-text">Read from <code className="wrap">{med.url}</code>.{med.idMatches ? "" : ` Its latest entry names ${med.doc.id}, not the DID above.`}</p>
              <dl className="kv small-text">
                <div><dt>id</dt><dd><code>{med.doc.id}</code></dd></div>
                {med.doc.relationships.map((r) => <div key={r.name}><dt>{r.name}</dt><dd>{r.ids.map((id) => <code key={id} className="wrap">{id} </code>)}</dd></div>)}
              </dl>
              <ul className="small-text" aria-label="Verification methods">
                {med.doc.verificationMethods.map((v, i) => <li key={`${v.id}-${i}`}><code className="wrap">{v.id}</code> {v.type}{v.publicKey && <>: <code className="wrap">{v.publicKey}</code></>}</li>)}
              </ul>
              <Services services={med.doc.services} />
            </>
          )}
          {med !== undefined && med !== "reading" && <button type="button" className="small" onClick={() => void load()}>Read again</button>}
        </>
      )}
    </details>
  );
}
