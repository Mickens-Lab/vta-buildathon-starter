// The who-can-call-what rows `npm run test:roles` asserts. Each row is a SAFE READ (no mutation) taken from the
// "Who-can-call-what" table in docs/VTC-SURFACE.md; scripts/test/roles-matrix-doc.test.ts keeps this list and that doc in step.
// `ok` = answered, `notFound` = answered "nothing open", `refused` = permissionDenied / notMember / "holds no entry".
export type Persona = "stranger" | "applicant" | "member" | "admin";
export type Outcome = "ok" | "notFound" | "refused";
export interface Row { task: string; expect: Partial<Record<Persona, Outcome[]>> }

export const MATRIX: Row[] = [
  { task: "vtc/join-requests/manifest/0.4", expect: { stranger: ["ok"], applicant: ["ok"], member: ["ok"], admin: ["ok"] } },
  { task: "vtc/community/theme/show/0.1", expect: { stranger: ["ok"], applicant: ["ok"], member: ["ok"], admin: ["ok"] } },
  { task: "vtc/join-requests/status/0.1", expect: { stranger: ["notFound"], applicant: ["ok"], member: ["ok"], admin: ["notFound"] } },
  { task: "vtc/community/profile/show/0.1", expect: { stranger: ["refused"], applicant: ["refused"], member: ["ok"], admin: ["ok"] } },
  { task: "vtc/directory/fields/list/0.1", expect: { stranger: ["refused"], applicant: ["refused"], member: ["ok"], admin: ["ok"] } },
  { task: "vtc/groups/list/0.2", expect: { stranger: ["refused"], applicant: ["refused"], member: ["ok"], admin: ["ok"] } },
  { task: "vtc/directory/card/show/0.1", expect: { stranger: ["refused"], applicant: ["refused"], member: ["ok"], admin: ["refused"] } },
  { task: "vtc/members/list/0.2", expect: { stranger: ["refused"], applicant: ["refused"], member: ["refused"], admin: ["ok"] } },
  { task: "vtc/join-requests/list/0.2", expect: { stranger: ["refused"], applicant: ["refused"], member: ["refused"], admin: ["ok"] } },
];
