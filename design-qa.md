**Findings**
- [P2] Source capture unavailable for formal side-by-side QA
  Location: source visual target `/Users/hanrui/EduResource-Agent-/html/bkhlbb.html`.
  Evidence: the in-app browser blocked direct `file://` navigation to the provided reference file, so the source page could not be captured in the same browser session as the implementation screenshots.
  Impact: the final Product Design QA cannot honestly claim a passed visual comparison, because the required source screenshot artifact is missing.
  Fix: serve the reference page through an approved local route or provide a screenshot export of `bkhlbb.html`, then rerun source-versus-implementation comparison.

**Open Questions**
- The implementation intentionally preserves teacher and viz-studio functionality while matching the reference visual language. No additional product behavior changes were reviewed in this QA pass.

**Implementation Checklist**
- Source visual truth path: `/Users/hanrui/EduResource-Agent-/html/bkhlbb.html`
- Source screenshot path: blocked by in-app browser `file://` URL policy.
- Implementation screenshot path: `/Users/hanrui/EduResource-Agent-/.design-qa/impl-viz-studio-final.png`
- Implementation screenshot path: `/Users/hanrui/EduResource-Agent-/.design-qa/impl-teacher-final-crop.png`
- Viewport: current in-app browser viewport.
- State: viz studio with local sorting animation selected; teacher portal hero after animation settled.
- Full-view comparison evidence: source capture blocked; implementation screenshots captured and inspected.
- Focused region comparison evidence: source capture blocked; focused visual checks performed on viz sidebar/header/iframe and teacher hero/header.
- Patches made since first QA pass: removed Freddie/yellow visible styling from viz studio, rethemed local iframe pages, simplified teacher copy, flattened mesh residue, strengthened teacher hero contrast, and fixed narrow-viewport image crop.
- final result: blocked

**Follow-up Polish**
- After a source screenshot is available, compare exact hero crop, masthead spacing, title scale, and section density against `bkhlbb.html` and close any remaining P3 fidelity gaps.
