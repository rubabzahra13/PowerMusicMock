// ─────────────────────────────────────────────────────────────
//  PENDING REQUESTS  (displayId: newest = 1)
// ─────────────────────────────────────────────────────────────
export const pendingRequests = [
  {
    id: "req-001",
    displayId: 1,
    receivedAt: "2026-06-23T09:41:00",
    submittedBy: {
      firstName: "Claire", lastName: "Hodges",
      email: "c.hodges@puregym.com", club: "PureGym Leeds"
    },
    person: { firstName: "James", lastName: "Walsh", email: "j.walsh@puregym.com", location: "Manchester" },
    action: "Add",
    notes: "Starting Monday 30 June, full membership.",
    tags: ["Already Exists"],
    createdBy: "Claire Hodges (Manager)"
  },
  {
    id: "req-002",
    displayId: 2,
    receivedAt: "2026-06-23T08:15:00",
    submittedBy: {
      firstName: "Deven", lastName: "Patel",
      email: "d.patel@anytime.com", club: "Anytime Fitness Birmingham"
    },
    person: { firstName: "Mike", lastName: "Hassan", email: "m.hassan@anytime.com", location: "Birmingham" },
    action: "Add",
    notes: "",
    tags: [],
    createdBy: "Deven Patel (Manager)"
  },
  {
    id: "req-003",
    displayId: 3,
    receivedAt: "2026-06-22T16:30:00",
    submittedBy: {
      firstName: "Rachel", lastName: "Clarke",
      email: "r.clarke@puregym.com", club: "PureGym Manchester"
    },
    person: { firstName: "Lisa", lastName: "Park", email: "l.park@puregym.com", location: "Leeds" },
    action: "Remove",
    notes: "Lisa has left the club as of 30 June.",
    tags: [],
    createdBy: "Rachel Clarke (Manager)"
  }
];

// ─────────────────────────────────────────────────────────────
//  HANDLED REQUESTS  (displayId: newest = 1)
// ─────────────────────────────────────────────────────────────
export const handledRequests = [
  {
    id: "req-h-001",
    displayId: 1,
    receivedAt: "2026-06-22T07:45:00",
    handledAt:  "2026-06-22T08:30:00",
    submittedBy: {
      firstName: "Deven", lastName: "Patel",
      email: "d.patel@puregym.com", club: "PureGym Leeds"
    },
    person: { firstName: "Sarah", lastName: "Cole", email: "s.cole@puregym.com", location: "Leeds" },
    action: "Remove",
    notes: "Sarah no longer works at this location.",
    tags: ["Removed"]
  },
  {
    id: "req-h-002",
    displayId: 2,
    receivedAt: "2026-06-21T13:30:00",
    handledAt:  "2026-06-21T14:15:00",
    submittedBy: {
      firstName: "Admin", lastName: "",
      email: "andrea@powermusic.com", club: "Manual entry"
    },
    person: { firstName: "Tom", lastName: "Briggs", email: "t.briggs@fitlife.com", location: "Bristol" },
    action: "Add",
    notes: "Manual admin entry: no manager form on file.",
    tags: ["Added"]
  },
  {
    id: "req-h-003",
    displayId: 3,
    receivedAt: "2026-06-18T10:15:00",
    handledAt:  "2026-06-18T11:02:00",
    submittedBy: {
      firstName: "Rachel", lastName: "Clarke",
      email: "r.clarke@puregym.com", club: "PureGym Manchester"
    },
    person: { firstName: "Priya", lastName: "Sharma", email: "p.sharma@puregym.com", location: "Manchester" },
    action: "Add",
    notes: "",
    tags: ["Added", "Already Exists"]
  },
  {
    id: "req-h-004",
    displayId: 4,
    receivedAt: "2026-06-16T08:30:00",
    handledAt:  "2026-06-16T09:15:00",
    submittedBy: {
      firstName: "Claire", lastName: "Hodges",
      email: "c.hodges@puregym.com", club: "PureGym Leeds"
    },
    person: { firstName: "Kevin", lastName: "Osei", email: "k.osei@anytime.com", location: "Birmingham" },
    action: "Add",
    notes: "Approved by regional manager.",
    tags: ["Added"]
  },
  {
    id: "req-h-005",
    displayId: 5,
    receivedAt: "2026-06-13T16:20:00",
    handledAt:  "2026-06-13T17:00:00",
    submittedBy: {
      firstName: "Deven", lastName: "Patel",
      email: "d.patel@anytime.com", club: "Anytime Birmingham"
    },
    person: { firstName: "Nina", lastName: "Bell", email: "n.bell@fitlife.com", location: "Bristol" },
    action: "Add",
    notes: "Awaiting template assignment for Bristol rollout.",
    tags: ["Added"]
  }
];

// ─────────────────────────────────────────────────────────────
//  USER LEDGER  (displayId: newest = 1)
// ─────────────────────────────────────────────────────────────
export const userLedger = [
  {
    id: "ul-001", displayId: 1,
    firstName: "James", lastName: "Walsh",
    email: "j.walsh@puregym.com", location: "Manchester",
    status: "Added", dateAdded: "2026-06-22T08:30:00",
    addedBy: "Claire Hodges", managerEmail: "c.hodges@puregym.com", club: "PureGym Leeds",
    sourceRequestId: "req-h-legacy-01",
    notes: "Transferred from legacy system. Verified club access on 22 Jun."
  },
  {
    id: "ul-002", displayId: 2,
    firstName: "Mike", lastName: "Hassan",
    email: "m.hassan@anytime.com", location: "Birmingham",
    status: "Added", dateAdded: "2026-06-21T14:15:00",
    addedBy: "Deven Patel", managerEmail: "d.patel@anytime.com", club: "Anytime Birmingham",
    sourceRequestId: "req-002",
    notes: ""
  },
  {
    id: "ul-003", displayId: 3,
    firstName: "Tom", lastName: "Briggs",
    email: "t.briggs@fitlife.com", location: "Bristol",
    status: "Added", dateAdded: "2026-06-21T14:15:00",
    addedBy: "Andrea (Admin)", managerEmail: "andrea@powermusic.com", club: "Manual entry",
    sourceRequestId: "req-h-002",
    notes: "Manual admin entry: no manager form on file."
  },
  {
    id: "ul-004", displayId: 4,
    firstName: "Priya", lastName: "Sharma",
    email: "p.sharma@puregym.com", location: "Manchester",
    status: "Added", dateAdded: "2026-06-18T11:02:00",
    addedBy: "Rachel Clarke", managerEmail: "r.clarke@puregym.com", club: "PureGym Manchester",
    sourceRequestId: "req-h-003",
    notes: ""
  },
  {
    id: "ul-005", displayId: 5,
    firstName: "Lisa", lastName: "Park",
    email: "l.park@puregym.com", location: "Leeds",
    status: "Removed", dateAdded: "2026-06-22T09:00:00",
    addedBy: "Rachel Clarke", managerEmail: "r.clarke@puregym.com", club: "PureGym Manchester",
    sourceRequestId: "req-h-legacy-02",
    notes: "Left club: access revoked per manager request."
  },
  {
    id: "ul-006", displayId: 6,
    firstName: "Sarah", lastName: "Cole",
    email: "s.cole@puregym.com", location: "Leeds",
    status: "Removed", dateAdded: "2026-06-22T08:30:00",
    addedBy: "Deven Patel", managerEmail: "d.patel@puregym.com", club: "PureGym Leeds",
    sourceRequestId: "req-h-legacy-03",
    notes: "Duplicate entry removed. Primary record kept under R-04."
  },
  {
    id: "ul-007", displayId: 7,
    firstName: "Kevin", lastName: "Osei",
    email: "k.osei@anytime.com", location: "Birmingham",
    status: "Added", dateAdded: "2026-06-16T09:15:00",
    addedBy: "Claire Hodges", managerEmail: "c.hodges@puregym.com", club: "PureGym Leeds",
    sourceRequestId: "req-h-004",
    notes: ""
  },
  {
    id: "ul-008", displayId: 8,
    firstName: "Nina", lastName: "Bell",
    email: "n.bell@fitlife.com", location: "Bristol",
    status: "Added", dateAdded: "2026-06-13T17:00:00",
    addedBy: "Deven Patel", managerEmail: "d.patel@anytime.com", club: "Anytime Birmingham",
    sourceRequestId: "req-h-005",
    notes: "Awaiting template assignment for new Bristol rollout."
  },
  {
    id: "ul-009", displayId: 9,
    firstName: "Amara", lastName: "Okonkwo",
    email: "a.okonkwo@fitlife.com", location: "London",
    status: "Added", dateAdded: "2026-05-28T10:45:00",
    addedBy: "Claire Hodges", managerEmail: "c.hodges@puregym.com", club: "PureGym Leeds",
    sourceRequestId: "req-h-legacy-04",
    notes: ""
  },
  {
    id: "ul-010", displayId: 10,
    firstName: "Daniel", lastName: "Ferreira",
    email: "d.ferreira@anytime.com", location: "Bristol",
    status: "Added", dateAdded: "2026-05-20T14:30:00",
    addedBy: "Deven Patel", managerEmail: "d.patel@anytime.com", club: "Anytime Birmingham",
    sourceRequestId: "req-h-legacy-05",
    notes: "Regional manager approved. Onboarding email sent 20 May."
  }
  // Note: In demo, display "47 records total" — the 10 above are the visible sample
];

// ─────────────────────────────────────────────────────────────
//  KPI DATA
// ─────────────────────────────────────────────────────────────
export const kpiData = {
  pendingRequests: 3,
  flaggedEmails: 1,
  templatesActive: 12,
  usersInLedger: 47,
  alreadyExistsWarnings: 2
};

// ─────────────────────────────────────────────────────────────
//  RECENT ACTIVITY
// ─────────────────────────────────────────────────────────────
export const recentActivity = [
  { id: "act-001", timestamp: "2026-06-23T09:41:00", type: "request_submitted", description: "New request: James Walsh", link: "req-001" },
  { id: "act-002", timestamp: "2026-06-23T09:41:00", type: "tag_applied", description: "⚠ Already Exists tag applied", link: "req-001" },
  { id: "act-003", timestamp: "2026-06-22T08:30:00", type: "marked_removed", description: "Removed: Sarah Cole", link: "req-h-001" },
  { id: "act-004", timestamp: "2026-06-21T14:15:00", type: "marked_added", description: "Added: Tom Briggs", link: "req-h-002" },
  { id: "act-005", timestamp: "2026-06-21T11:00:00", type: "template_updated", description: "Template updated: Membership Enquiry v2", link: null }
];

// ─────────────────────────────────────────────────────────────
//  TEMPLATES
// ─────────────────────────────────────────────────────────────
export const templates = [
  {
    id: "tmpl-001", name: "Membership Enquiry", category: "Membership",
    status: "Active", timesUsed: 34, lastUpdated: "2026-06-10T11:42:00",
    subject: "Re: Your membership enquiry",
    body: "Hi {{first_name}},\n\nThank you for getting in touch about joining {{club_name}}.\n\nWe'd be delighted to help with your membership enquiry. Our current membership options are available on our website, and I'd be happy to walk you through the options that best suit your needs.\n\nPlease let me know if you have any questions.\n\nKind regards,\nPower Music Team"
  },
  {
    id: "tmpl-002", name: "Membership Enquiry (Legacy)", category: "Membership",
    status: "Archived", timesUsed: 12, lastUpdated: "2026-03-01T09:00:00",
    subject: "Re: Enquiry",
    body: "Hi {{first_name}}, thanks for your enquiry about {{membership_type}}."
  },
  {
    id: "tmpl-003", name: "Cancellation Acknowledgement", category: "Membership",
    status: "Active", timesUsed: 18, lastUpdated: "2026-05-15T14:20:00",
    subject: "Re: Your cancellation request",
    body: "Hi {{first_name}},\n\nWe've received your cancellation request for your {{membership_type}} membership at {{club_name}} and will process it within 5 business days.\n\nIf you change your mind, please don't hesitate to get in touch.\n\nKind regards,\nPower Music Team"
  },
  {
    id: "tmpl-004", name: "Renewal Reminder", category: "Membership",
    status: "Active", timesUsed: 27, lastUpdated: "2026-06-01T10:15:00",
    subject: "Re: Your renewal",
    body: "Hi {{first_name}},\n\nYour {{membership_type}} membership at {{club_name}} is due for renewal.\n\nWe'd love to keep you with us — please find your renewal options below.\n\nKind regards,\nPower Music Team"
  },
  {
    id: "tmpl-005", name: "Payment Confirmation", category: "Payments",
    status: "Active", timesUsed: 9, lastUpdated: "2026-04-20T16:30:00",
    subject: "Payment received — {{club_name}}",
    body: "Hi {{first_name}},\n\nWe're confirming receipt of your payment for {{membership_type}} at {{club_name}}.\n\nYour account is now up to date. Thank you!\n\nKind regards,\nPower Music Team"
  },
  {
    id: "tmpl-006", name: "Payment Failed Notice", category: "Payments",
    status: "Active", timesUsed: 11, lastUpdated: "2026-05-28T09:45:00",
    subject: "Action required: Payment failed",
    body: "Hi {{first_name}},\n\nUnfortunately your recent payment for your {{membership_type}} membership at {{club_name}} was unsuccessful.\n\nPlease update your payment details at your earliest convenience to avoid any interruption to your membership.\n\nKind regards,\nPower Music Team"
  },
  {
    id: "tmpl-007", name: "Event Invitation", category: "Events",
    status: "Active", timesUsed: 22, lastUpdated: "2026-06-05T13:00:00",
    subject: "You're invited — {{club_name}} event",
    body: "Hi {{first_name}},\n\nWe'd like to invite you to an upcoming event at {{club_name}}.\n\nDetails will be shared shortly. We hope to see you there!\n\nKind regards,\nPower Music Team"
  },
  {
    id: "tmpl-008", name: "General Enquiry Response", category: "General Enquiries",
    status: "Active", timesUsed: 6, lastUpdated: "2026-05-10T11:15:00",
    subject: "Re: Your enquiry",
    body: "Hi {{first_name}},\n\nThank you for contacting {{club_name}}. We've received your message and will get back to you within 2 business days.\n\nKind regards,\nPower Music Team"
  },
  {
    id: "tmpl-009", name: "Welcome Email", category: "Membership",
    status: "Active", timesUsed: 41, lastUpdated: "2026-04-01T08:30:00",
    subject: "Welcome to Power Music — {{club_name}}",
    body: "Hi {{first_name}},\n\nWelcome to {{club_name}}! We're thrilled to have you on board as a {{membership_type}} member.\n\nIf you have any questions during your first few weeks, don't hesitate to reach out.\n\nKind regards,\nPower Music Team"
  },
  {
    id: "tmpl-010", name: "Out of Office Auto-Reply", category: "Other",
    status: "Active", timesUsed: 0, lastUpdated: "2026-06-15T09:00:00",
    subject: "Out of Office — {{club_name}}",
    body: "Thank you for contacting {{club_name}}.\n\nWe are currently out of office and will respond upon our return.\n\nFor urgent matters, please call our main line.\n\nKind regards,\nPower Music Team"
  },
  {
    id: "tmpl-011", name: "Invoice Query Response (Draft)", category: "Payments",
    status: "Draft", timesUsed: 0, lastUpdated: "2026-06-22T15:30:00",
    subject: "Re: Invoice query",
    body: "Hi {{first_name}},\n\n[DRAFT — pending approval]\n\nThank you for your invoice query regarding your {{membership_type}} account at {{club_name}}.\n\nPlease find the requested information below.\n\nKind regards,\nPower Music Team"
  },
  {
    id: "tmpl-012", name: "Event Follow-Up", category: "Events",
    status: "Active", timesUsed: 3, lastUpdated: "2026-06-20T10:00:00",
    subject: "Thank you for attending — {{club_name}}",
    body: "Hi {{first_name}},\n\nThank you for joining us at the recent {{club_name}} event. We hope you enjoyed it!\n\nWe'd love to hear your feedback.\n\nKind regards,\nPower Music Team"
  }
];
