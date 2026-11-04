🔍 ClaimLens AI – Multimodal Insurance Claims Investigator

 Vehicle claims, verified at the scene. AI-assisted, human-decided.
 ClaimLens AI helps policyholders file motor insurance claims with trusted evidence, and helps insurers review them faster without letting AI make the final decision.

💡 Features:

For policyholders:
- Live camera evidence: front, rear, left, right, close-up and optional other-vehicle photos, taken on the spot (no gallery uploads)
- Instant photo checks: blur, brightness and framing are checked before a photo is accepted
- AI consistency check: each photo is compared with the accident description
- Indian motor documents: insurance policy, RC book, driving licence, claim form, PAN and Aadhaar are required; CSR/FIR, repair estimate and supporting files are optional
- AI owner-name check: confirms the RC book owner and the insured person on the policy are the same, and checks the claimant name too
- Insurer claim number: stored with each claim
- Live status tracking and notifications: from Draft to Approved/Rejected

 For insurers and investigators:
- Separate, role-protected investigator console
- Multimodal AI investigation report covering photos, policy and estimates, with cited sources
- Approve, reject or request more evidence; every decision is logged
- AI findings are treated as signals, never as proof of fraud

🔐 Security:

- Roles kept in a separate protected table; no admin credentials in code
- Row-level security on every table; private file storage with signed access
- Upload type and size checks, rate limits and status-change rules
- Leaked-password protection, safe password reset that doesn't reveal whether an account exists, and security headers
- Audit log of admin decisions

🛠️ Tech stack:

- Frontend Framework: TanStack Start (React 19, TypeScript, Vite 7)
- UI & Styling: Tailwind CSS v4, shadcn/ui
- Backend: Supabase
- Database: PostgreSQL
- Authentication: Supabase Auth
- Cloud Storage: Supabase Storage
- AI Integration: Lovable AI Gateway (Multimodal AI Models)
- Deployment: Vercel
- Testing: Vitest
- Version Control: GitHub

🌐 Live demo:

 https://claimlens-arkiun70u-aruneesh.vercel.app/

⚖️ Disclaimer:

 AI output supports investigators and never replaces them. Every claim decision is made by a person.
