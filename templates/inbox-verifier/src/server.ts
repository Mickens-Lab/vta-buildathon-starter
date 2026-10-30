// POST /inbox   a signed Trust Task document -> response or error document
// GET  /notes   what has been accepted so far
// GET  /did     the DID this inbox answers to (documents must be addressed to it)
//
// Fully offline: the sender's did:key carries its public key, so verification
// needs no network and no VTA. Set INBOX_PORT / INBOX_DID to override.
import { createServer } from "node:http";
import { createInbox } from "./inbox.js";

const port = Number(process.env.INBOX_PORT ?? 4000);
const myDid = process.env.INBOX_DID ?? "did:web:inbox.buildathon.example";

export function startServer(p = port) {
  const inbox = createInbox(myDid);
  const server = createServer(async (req, res) => {
    const send = (status: number, body: unknown) => {
      res.writeHead(status, { "content-type": "application/json", "access-control-allow-origin": "*" });
      res.end(JSON.stringify(body));
    };
    try {
      if (req.method === "GET" && req.url === "/notes") return send(200, inbox.notes);
      if (req.method === "GET" && req.url === "/did") return send(200, { did: myDid });
      if (req.method === "POST" && req.url === "/inbox") {
        let raw = "";
        for await (const chunk of req) {
          raw += chunk;
          if (raw.length > 64_000) return send(413, { error: "too large" });
        }
        let doc: any;
        try {
          doc = JSON.parse(raw);
        } catch {
          return send(400, { error: "not JSON" });
        }
        const v = await inbox.receive(doc);
        console.log(`${doc?.issuer ?? "?"} ${doc?.id ?? "?"} -> ${v.kind}${"code" in v ? ` (${v.code})` : ""}`);
        if (v.kind === "accepted") return send(200, v.response);
        if (v.kind === "duplicate") return v.response ? send(200, v.response) : send(204, {});
        if (v.kind === "rejected") return send(400, v.error);
        return send(202, {}); // suppressed: say nothing (SPEC 8.1)
      }
      send(404, { error: "not found" });
    } catch (e) {
      console.error(e);
      send(500, { error: "internal" });
    }
  });
  return new Promise<{ url: string; did: string; close: () => Promise<void> }>((resolve) =>
    server.listen(p, "127.0.0.1", () => {
      const addr = server.address() as { port: number };
      resolve({
        url: `http://127.0.0.1:${addr.port}`,
        did: myDid,
        close: () => new Promise((r) => server.close(() => r())),
      });
    }),
  );
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const s = await startServer();
  console.log(`inbox listening on ${s.url}  (DID ${s.did})`);
}
