# Family Tree Roadmap

This document outlines the scope of the first stable release (v1.0) and lists future development ideas to maintain project focus and avoid feature creep.

---

## 🎯 Version 1.0 Scope (Stable Release)

These are the required features completed for a stable, functional, and user-friendly release.

### 1. Detailed Biographical Profiles ✅
- [x] **Life Events & Dates:**
  - [x] Birthplace (`birth_place`) — text field
  - [x] Birth time (`birth_time`) — freeform text (e.g. "around noon")
  - [x] Deathplace (`death_place`) — text field
- [x] **Biographical details:**
  - [x] Education (`education`) — text field
  - [x] Profession (`profession`) — text field
  - [x] Residence (`residence`) — cities/villages where the person lived

### 2. UI & Graph Navigation ✅
- [x] **Zoom Controls:** Dedicated on-screen `+` and `-` buttons for easier zoom control alongside mouse scroll wheel actions.
- [x] **Responsive Mobile Layout (Mobile UI):** Refined mobile styling (transforming the profile side panel into a bottom sheet drawer).

### 3. Relationship Types ✅
- [x] **Marriage Data:** Support for marriage date and location details on `SPOUSE` relation lines.
- [x] **Divorce Support:** Support for divorced states (represented visually as dashed red lines to denote past relationships).

### 4. Backups ✅
- [x] **JSON Backup (Export & Import):** Ability to download all relational and biographical data into a single JSON file and upload it back, preventing data loss and facilitating migration.

---

## 🚀 Future Enhancements (Version 2.0+)

These features will be evaluated and developed following the v1.0 release.

### Visualization & UI
- [ ] **Search by Name:** A search bar in the toolbar filtering individuals and centering/focusing on their tree node upon selection.
- [ ] **Minimap / Overview Canvas:** A small map overlay in the corner for easier navigation of large family trees.
- [ ] **Transitions:** Smooth pan/focus animations when clicking relations.
- [ ] **Color Coding:** Distinguish different family branches or lineages using node background colors.
- [ ] **Drag & Drop Gallery:** Rearrange uploaded pictures inside a profile's gallery via drag-and-drop.
- [ ] **Edit Captions:** Quickly update descriptions on already uploaded images.

### Data & Documents
- [ ] **Document Attachments:** Upload PDFs, birth certificates, and historical documents to a person's profile.
- [ ] **Video Support:** Upload and play short video clips in profile galleries.
- [ ] **Adoptions:** Special visualization styles and relationship connectors to differentiate adoptive parents/children.

### Import / Export Extensions
- [ ] **GEDCOM Support:** Standardized genealogy format (GEDCOM) import and export for compatibility with platforms like MyHeritage.
- [ ] **Print Export:** Export high-resolution SVG/PDF formats optimized for printing.

### Accounts & Security
- [ ] **User Authentication:** Login, registration, and user roles (Admin vs. Read-Only access).
- [ ] **Tree Sharing:** Generate read-only links to share the tree securely with family members.
- [ ] **Multi-Tree Support:** Manage multiple distinct family trees within a single user account.
- [ ] **Audit Logs:** Track historical modifications to records.

### Analysis & Utilities
- [ ] **Statistics Dashboard:** Calculate statistics (average lifespan, generation counts, gender ratios, etc.).
- [ ] **"On This Day" Events:** Show anniversaries and birthdays occurring on the current day.
- [ ] **Relation Calculator:** Calculate direct connection paths between any two chosen individuals (e.g. "Second cousin once removed").
