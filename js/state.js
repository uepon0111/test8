// ===================================================================
// state.js
// Shared mutable application state.
//
// IMPORTANT: because this project intentionally avoids a bundler/module
// system (so it can keep running as plain <script> tags on GitHub Pages),
// every plain top-level `let`/`const` below lives in the single shared
// global scope. To avoid "already declared" collisions across files,
// ALL cross-file mutable primitives/collections are declared exactly
// once, here. New subsystems added for this feature set (device
// profiles, settings UI, notifications, sort/filter progress) instead
// group their state inside a single namespaced object declared in their
// own file, so they only need one top-level identifier each.
// ===================================================================

// --- Auth (auth.js) ---
let tokenClient;
let gapiInited = false;
let gisInited = false;

// --- Result data (data-loader.js / sort-filter.js / render.js) ---
let allRecords = [];      // Every record fetched from Drive
let filteredRecords = []; // Currently visible (post filter+sort) records

// --- Music master DB (music-db.js) ---
let dbMusics = [];
let dbDiffs = [];

// --- Selection mode (selection.js) ---
let isSelectMode = false;
let selectedIds = new Set();

// --- Upload / edit batch workflow (batch-modal.js) ---
let editorQueue = []; // { id, file, imgUrl, status, data:{}, originalId?, originalParent?, profileId }
let activeItemId = null;
let currentMode = 'upload'; // 'upload' | 'edit'
