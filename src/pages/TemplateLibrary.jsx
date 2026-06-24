import { useState, useMemo, useEffect } from 'react';
import { Search, FileText, Trash2, Save, X, ChevronDown, Plus, Pencil } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { templates as mockTemplates } from '../data/mockData';
import { Toast, useToast, Modal } from '../components/ui';
import PageHeader from '../components/layout/PageHeader';

// ─── Language content swapper ──────────────────────────────────────────────────
const LANG_VARIANTS = {
  English: null, // use original
  German: {
    subjectPrefix: 'AW: ',
    salutation: 'Guten Tag {{first_name}},',
    closing: 'Mit freundlichen Grüßen,\nPower Music Team',
    bodyMiddle: '[Automatisch übersetzt — Inhalte werden in Kürze bereitgestellt.]'
  },
  Spanish: {
    subjectPrefix: 'RE: ',
    salutation: 'Estimado/a {{first_name}},',
    closing: 'Atentamente,\nEquipo de Power Music',
    bodyMiddle: '[Traducido automáticamente — el contenido se proporcionará en breve.]'
  },
  Japanese: {
    subjectPrefix: 'RE: ',
    salutation: '{{first_name}} 様、',
    closing: 'よろしくお願いいたします。\nPower Music チーム',
    bodyMiddle: '[自動翻訳 — コンテンツは近日中に提供されます。]'
  }
};

function translateBody(originalBody, lang) {
  if (lang === 'English' || !LANG_VARIANTS[lang]) return originalBody;
  const v = LANG_VARIANTS[lang];
  const lines = originalBody.split('\n');
  const bodyLines = lines.slice(1, -2).join('\n'); // strip salutation + closing
  return `${v.salutation}\n\n${v.bodyMiddle}\n\n${bodyLines}\n\n${v.closing}`;
}
function translateSubject(originalSubject, lang) {
  if (lang === 'English' || !LANG_VARIANTS[lang]) return originalSubject;
  return LANG_VARIANTS[lang].subjectPrefix + originalSubject;
}

// ─── Shared format helpers ─────────────────────────────────────────────────────
const fmtUpdated = (iso) => {
  if (!iso) return '—';
  try { return format(parseISO(iso), "dd MMM yyyy, hh:mm a"); }
  catch { return iso; }
};

// ─── Template List Item ────────────────────────────────────────────────────────
function TemplateListItem({ template, isSelected, onClick }) {
  return (
    <button
      onClick={onClick}
      className={`w-full text-left px-4 py-3.5 flex items-start gap-3 transition-colors border-b border-[var(--color-border-default)] last:border-b-0 cursor-pointer ${
        isSelected
          ? 'bg-[var(--color-surface-highlight)] border-l-2 border-l-[var(--color-brand-primary)]'
          : 'hover:bg-gray-50'
      }`}
    >
      <FileText className={`w-4 h-4 shrink-0 mt-0.5 ${isSelected ? 'text-[var(--color-brand-primary)]' : 'text-gray-400'}`} />
      <div className="flex-1 min-w-0">
        <div className={`text-sm font-semibold truncate ${isSelected ? 'text-[var(--color-brand-primary)]' : 'text-[var(--color-text-primary)]'}`}>
          {template.name}
        </div>
        <div className="text-xs text-[var(--color-text-muted)] truncate mt-0.5 font-normal">
          {template.subject}
        </div>
        <div className="flex items-center gap-2 mt-1.5">
          <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-bold leading-none ${
            template.status === 'Active' ? 'bg-emerald-50 text-emerald-700' :
            template.status === 'Draft' ? 'bg-amber-50 text-amber-700' :
            'bg-gray-100 text-gray-500'
          }`}>
            {template.status}
          </span>
          <span className="text-[10px] text-[var(--color-text-muted)]">{template.category}</span>
        </div>
      </div>
    </button>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────────────
export default function TemplateManagement() {
  const { showToast } = useToast();

  // Template state (persisted in localStorage)
  const [templates, setTemplates] = useState(() => {
    const stored = localStorage.getItem('power_music_templates_v2');
    if (stored) { try { return JSON.parse(stored); } catch { /* fallthrough */ } }
    return mockTemplates;
  });
  useEffect(() => {
    localStorage.setItem('power_music_templates_v2', JSON.stringify(templates));
  }, [templates]);

  // Left pane controls
  const [search, setSearch] = useState('');
  const [sortMode, setSortMode] = useState('alpha-asc'); // 'alpha-asc' | 'alpha-desc' | 'recent'
  const [categoryFilter, setCategoryFilter] = useState('All Categories');

  // Right pane: which template is selected + editor form state
  const [selectedId, setSelectedId] = useState(null);
  const [editForm, setEditForm] = useState(null);   // { name, subject, body, language }
  const [isDirty, setIsDirty] = useState(false);
  const [isEditing, setIsEditing] = useState(false);

  // Delete confirm modal
  const [showDeleteModal, setShowDeleteModal] = useState(false);

  // New template creation mode
  const [isCreatingNew, setIsCreatingNew] = useState(false);

  const categories = ['All Categories', 'Membership', 'Payments', 'Events', 'General Enquiries', 'Other'];

  // ── Filtered + sorted list ──
  const displayedTemplates = useMemo(() => {
    const q = search.trim().toLowerCase();
    const filtered = templates.filter((t) => {
      const matchSearch = q === '' || t.name.toLowerCase().includes(q) || t.subject.toLowerCase().includes(q);
      const matchCat = categoryFilter === 'All Categories' || t.category === categoryFilter;
      return matchSearch && matchCat;
    });
    return [...filtered].sort((a, b) => {
      if (sortMode === 'alpha-asc') return a.name.localeCompare(b.name);
      if (sortMode === 'alpha-desc') return b.name.localeCompare(a.name);
      // recent
      return new Date(b.lastUpdated) - new Date(a.lastUpdated);
    });
  }, [templates, search, sortMode, categoryFilter]);

  // ── Select a template ──
  const selectedTemplate = templates.find(t => t.id === selectedId) || null;

  const handleSelectTemplate = (tmpl) => {
    setIsCreatingNew(false);
    setIsDirty(false);
    setIsEditing(false);
    setSelectedId(tmpl.id);
    setEditForm({ name: tmpl.name, subject: tmpl.subject, body: tmpl.body, language: 'English' });
  };

  const handleStartEditing = () => {
    if (!selectedTemplate) return;
    setIsEditing(true);
    setIsDirty(false);
    setEditForm({
      name: selectedTemplate.name,
      subject: selectedTemplate.subject,
      body: selectedTemplate.body,
      language: editForm?.language || 'English'
    });
  };

  // ── Start creating a new template ──
  const handleNewTemplate = () => {
    setIsCreatingNew(true);
    setIsEditing(true);
    setSelectedId(null);
    setIsDirty(false);
    setEditForm({
      name: '',
      subject: '',
      body: 'Hi {{first_name}},\n\n\n\nKind regards,\nPower Music Team',
      language: 'English',
      category: 'Membership',
      status: 'Draft'
    });
  };

  // ── Language switch ──
  const handleLanguageChange = (lang) => {
    if (!selectedTemplate) return;
    setEditForm(prev => ({
      ...prev,
      language: lang,
      subject: translateSubject(selectedTemplate.subject, lang),
      body: translateBody(selectedTemplate.body, lang)
    }));
    setIsDirty(true);
  };

  // ── Field change ──
  const handleFieldChange = (field, value) => {
    setEditForm(prev => ({ ...prev, [field]: value }));
    setIsDirty(true);
  };

  // ── Save (handles both create and update) ──
  const handleSave = () => {
    if (!editForm) return;

    if (isCreatingNew) {
      // Validate required fields
      if (!editForm.name.trim() || !editForm.subject.trim()) {
        showToast('Please fill in the template name and subject.', 'error');
        return;
      }
      const newTemplate = {
        id: `tmpl-${Date.now()}`,
        name: editForm.name.trim(),
        subject: editForm.subject.trim(),
        body: editForm.body,
        category: editForm.category || 'Membership',
        status: editForm.status || 'Draft',
        timesUsed: 0,
        lastUpdated: new Date().toISOString()
      };
      setTemplates(prev => [...prev, newTemplate]);
      setSelectedId(newTemplate.id);
      setIsCreatingNew(false);
      setIsEditing(false);
      setIsDirty(false);
      showToast('Template created successfully.', 'success');
      return;
    }

    // Update existing
    if (!selectedId) return;
    setTemplates(prev => prev.map(t =>
      t.id === selectedId
        ? { ...t, name: editForm.name, subject: editForm.subject, body: editForm.body, lastUpdated: new Date().toISOString() }
        : t
    ));
    setIsDirty(false);
    setIsEditing(false);
    showToast('Template saved successfully.', 'success');
  };

  // ── Cancel ──
  const handleCancel = () => {
    if (isCreatingNew) {
      setIsCreatingNew(false);
      setIsEditing(false);
      setEditForm(null);
      setIsDirty(false);
      return;
    }
    if (!selectedTemplate) return;
    setEditForm({
      name: selectedTemplate.name,
      subject: selectedTemplate.subject,
      body: selectedTemplate.body,
      language: 'English'
    });
    setIsDirty(false);
    setIsEditing(false);
  };

  // ── Delete ──
  const handleDelete = () => {
    setTemplates(prev => prev.filter(t => t.id !== selectedId));
    setSelectedId(null);
    setEditForm(null);
    setIsDirty(false);
    setIsEditing(false);
    setShowDeleteModal(false);
    showToast('Template deleted.', 'success');
  };

  return (
    <div className="max-w-7xl mx-auto select-none flex flex-col h-[calc(100vh-3rem)] max-h-[calc(100vh-3rem)] overflow-hidden">
      <Toast />

      <PageHeader
        section="Customer service"
        title="Manage gmail templates"
        description="Create, edit, and preview reply templates used in Gmail."
        className="mb-4 shrink-0"
        meta={
          <span className="inline-flex px-2.5 py-1 rounded-full text-xs font-semibold bg-[var(--color-surface-highlight)] text-[var(--color-text-secondary)]">
            {templates.length} templates
          </span>
        }
        actions={
          <button
            onClick={handleNewTemplate}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold text-white bg-[var(--color-brand-primary)] hover:bg-[var(--color-surface-sidebar-hover)] transition-colors shadow-sm cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            New Template
          </button>
        }
      />

      {/* Master-Detail container */}
      <div className="flex flex-1 min-h-0 rounded-xl border border-[var(--color-border-default)] overflow-hidden shadow-sm bg-white">

        {/* ── LEFT PANE ─────────────────────────────────────────── */}
        <div className="w-[37%] flex flex-col border-r border-[var(--color-border-default)] shrink-0 min-h-0">

          {/* Left pane controls */}
          <div className="p-4 border-b border-[var(--color-border-default)] space-y-3 bg-gray-50">
            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--color-text-muted)]" />
              <input
                type="text"
                placeholder="Search templates..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-9 pr-3 py-2 bg-white border border-[var(--color-border-default)] rounded-lg text-sm text-[var(--color-text-primary)] placeholder-[var(--color-text-muted)] focus:outline-none focus:border-[var(--color-border-focus)] transition-colors"
              />
            </div>

            {/* Sort + Category row */}
            <div className="flex gap-2">
              <div className="relative flex-1">
                <select
                  value={sortMode}
                  onChange={(e) => setSortMode(e.target.value)}
                  className="w-full appearance-none px-3 py-2 pr-7 bg-white border border-[var(--color-border-default)] rounded-lg text-xs font-semibold text-[var(--color-text-primary)] focus:outline-none focus:border-[var(--color-border-focus)] cursor-pointer"
                >
                  <option value="alpha-asc">A → Z</option>
                  <option value="alpha-desc">Z → A</option>
                  <option value="recent">Recently Updated</option>
                </select>
                <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[var(--color-text-muted)] pointer-events-none" />
              </div>
              <div className="relative flex-1">
                <select
                  value={categoryFilter}
                  onChange={(e) => setCategoryFilter(e.target.value)}
                  className="w-full appearance-none px-3 py-2 pr-7 bg-white border border-[var(--color-border-default)] rounded-lg text-xs font-semibold text-[var(--color-text-primary)] focus:outline-none focus:border-[var(--color-border-focus)] cursor-pointer"
                >
                  {categories.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
                <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[var(--color-text-muted)] pointer-events-none" />
              </div>
            </div>

            {/* Meta */}
            <p className="text-[11px] text-[var(--color-text-muted)] font-medium">
              {displayedTemplates.length} of {templates.length} templates
            </p>
          </div>

          {/* Scrollable template list */}
          <div className="flex-1 overflow-y-auto">
            {displayedTemplates.length === 0 ? (
              <div className="flex items-center justify-center h-32 text-sm text-[var(--color-text-muted)]">
                No templates found
              </div>
            ) : (
              displayedTemplates.map((tmpl) => (
                <TemplateListItem
                  key={tmpl.id}
                  template={tmpl}
                  isSelected={tmpl.id === selectedId}
                  onClick={() => handleSelectTemplate(tmpl)}
                />
              ))
            )}
          </div>
        </div>

        {/* ── RIGHT PANE ────────────────────────────────────────── */}
        <div className="flex-1 flex flex-col min-h-0 min-w-0">
          {!selectedTemplate && !isCreatingNew ? (
            <div className="flex-1 flex flex-col items-center justify-center gap-4 text-[var(--color-text-muted)] p-8 text-center min-h-0">
              <div className="w-14 h-14 rounded-2xl bg-[var(--color-surface-highlight)] flex items-center justify-center">
                <FileText className="w-7 h-7 text-[var(--color-brand-primary)]/40" />
              </div>
              <div className="space-y-2 max-w-sm">
                <p className="text-sm font-bold text-[var(--color-text-primary)]">No template selected</p>
                <p className="text-xs leading-relaxed text-[var(--color-text-secondary)]">
                  Click any template in the list on the left to preview its details here.
                  To start fresh, use <strong className="text-[var(--color-text-primary)]">New Template</strong> in the top right.
                </p>
              </div>
            </div>
          ) : (
            <>
              {/* Editor header */}
              <div className="flex items-start justify-between px-6 py-4 border-b border-[var(--color-border-default)] shrink-0">
                <div>
                  <h3 className="text-base font-bold text-[var(--color-text-primary)] leading-snug">
                    {isCreatingNew
                      ? (editForm?.name?.trim() || 'New Template')
                      : (editForm?.name || selectedTemplate.name)
                    }
                    {isDirty && <span className="ml-2 text-xs font-semibold text-amber-500">● Unsaved</span>}
                    {isCreatingNew && (
                      <span className="ml-2 px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-50 text-amber-700 leading-none align-middle">Creating</span>
                    )}
                  </h3>
                  <p className="text-xs text-[var(--color-text-muted)] mt-0.5 font-medium">
                    {isCreatingNew ? 'New template — not yet saved' : `Last updated ${fmtUpdated(selectedTemplate.lastUpdated)}`}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0 ml-4">
                  {!isCreatingNew && !isEditing && (
                    <>
                      <button
                        type="button"
                        onClick={handleStartEditing}
                        aria-label="Edit template"
                        className="p-2 rounded-lg text-[var(--color-text-secondary)] hover:text-[var(--color-brand-primary)] hover:bg-[var(--color-surface-highlight)] transition-colors cursor-pointer"
                      >
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setShowDeleteModal(true)}
                        aria-label="Delete template"
                        className="p-2 rounded-lg text-[var(--color-text-secondary)] hover:text-red-600 hover:bg-red-50 transition-colors cursor-pointer"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </>
                  )}
                  {(isEditing || isCreatingNew) && (
                    <>
                      {!isCreatingNew && (
                        <button
                          type="button"
                          onClick={() => setShowDeleteModal(true)}
                          aria-label="Delete template"
                          className="p-2 rounded-lg text-[var(--color-text-secondary)] hover:text-red-600 hover:bg-red-50 transition-colors cursor-pointer"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={handleCancel}
                        aria-label={isCreatingNew ? 'Discard new template' : 'Cancel editing'}
                        className="p-2 rounded-lg text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-surface-highlight)] transition-colors cursor-pointer"
                      >
                        <X className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={handleSave}
                        className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-semibold text-white bg-[var(--color-brand-primary)] hover:bg-[var(--color-surface-sidebar-hover)] transition-colors shadow-sm cursor-pointer"
                      >
                        <Save className="w-3.5 h-3.5" />
                        {isCreatingNew ? 'Create Template' : 'Save'}
                      </button>
                    </>
                  )}
                </div>
              </div>

              {/* Editor form */}
              <div className="flex-1 min-h-0 overflow-y-auto px-6 py-6 space-y-5">
                {!(isEditing || isCreatingNew) && (
                  <div className="rounded-lg border border-[var(--color-border-default)] bg-[var(--color-surface-panel)]/50 px-4 py-3 text-xs text-[var(--color-text-secondary)]">
                    Preview mode. Click the pencil icon above to edit this template.
                  </div>
                )}

                {/* Category + Status — only shown when creating */}
                {isCreatingNew && (
                  <div className="grid grid-cols-2 gap-4 pb-5 border-b border-[var(--color-border-default)]">
                    <div className="space-y-1.5">
                      <label className="block text-xs font-bold text-[var(--color-text-secondary)] uppercase tracking-wider">
                        Category *
                      </label>
                      <div className="relative">
                        <select
                          value={editForm?.category || 'Membership'}
                          onChange={(e) => handleFieldChange('category', e.target.value)}
                          className="w-full appearance-none px-3 py-2.5 pr-8 bg-white border border-[var(--color-border-default)] rounded-lg text-sm text-[var(--color-text-primary)] focus:outline-none focus:border-[var(--color-border-focus)] cursor-pointer transition-colors"
                        >
                          {['Membership', 'Payments', 'Events', 'General Enquiries', 'Other'].map(c => (
                            <option key={c} value={c}>{c}</option>
                          ))}
                        </select>
                        <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[var(--color-text-muted)] pointer-events-none" />
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <label className="block text-xs font-bold text-[var(--color-text-secondary)] uppercase tracking-wider">
                        Status *
                      </label>
                      <div className="relative">
                        <select
                          value={editForm?.status || 'Draft'}
                          onChange={(e) => handleFieldChange('status', e.target.value)}
                          className="w-full appearance-none px-3 py-2.5 pr-8 bg-white border border-[var(--color-border-default)] rounded-lg text-sm text-[var(--color-text-primary)] focus:outline-none focus:border-[var(--color-border-focus)] cursor-pointer transition-colors"
                        >
                          <option value="Draft">Draft</option>
                          <option value="Active">Active</option>
                        </select>
                        <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[var(--color-text-muted)] pointer-events-none" />
                      </div>
                    </div>
                  </div>
                )}

                {/* Language — only shown when editing existing */}
                {!isCreatingNew && (
                  <div className="space-y-1.5">
                    <label className="block text-xs font-bold text-[var(--color-text-secondary)] uppercase tracking-wider">
                      Translation / Language
                    </label>
                    {isEditing ? (
                      <>
                        <div className="relative inline-block">
                          <select
                            value={editForm?.language || 'English'}
                            onChange={(e) => handleLanguageChange(e.target.value)}
                            className="appearance-none pl-3 pr-8 py-2 bg-white border border-[var(--color-border-default)] rounded-lg text-sm font-semibold text-[var(--color-text-primary)] focus:outline-none focus:border-[var(--color-border-focus)] cursor-pointer transition-colors"
                          >
                            {['English', 'German', 'Spanish', 'Japanese'].map(l => (
                              <option key={l} value={l}>{l}</option>
                            ))}
                          </select>
                          <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[var(--color-text-muted)] pointer-events-none" />
                        </div>
                        <p className="text-xs text-[var(--color-text-muted)]">
                          Switching language swaps subject and body with translated mock content.
                        </p>
                      </>
                    ) : (
                      <div className="px-3 py-2.5 bg-[var(--color-surface-panel)] border border-[var(--color-border-default)] rounded-lg text-sm text-[var(--color-text-primary)]">
                        {editForm?.language || 'English'}
                      </div>
                    )}
                  </div>
                )}

                {/* Field 2: Template Name */}
                <div className="space-y-1.5">
                  <label className="block text-xs font-bold text-[var(--color-text-secondary)] uppercase tracking-wider">
                    Template Name
                  </label>
                  {isEditing || isCreatingNew ? (
                    <input
                      type="text"
                      value={editForm?.name || ''}
                      onChange={(e) => handleFieldChange('name', e.target.value)}
                      className="w-full px-3 py-2.5 bg-white border border-[var(--color-border-default)] rounded-lg text-sm text-[var(--color-text-primary)] focus:outline-none focus:border-[var(--color-border-focus)] transition-colors"
                    />
                  ) : (
                    <div className="px-3 py-2.5 bg-[var(--color-surface-panel)] border border-[var(--color-border-default)] rounded-lg text-sm text-[var(--color-text-primary)]">
                      {editForm?.name || ''}
                    </div>
                  )}
                </div>

                {/* Field 3: Email Subject */}
                <div className="space-y-1.5">
                  <label className="block text-xs font-bold text-[var(--color-text-secondary)] uppercase tracking-wider">
                    Email Subject
                  </label>
                  {isEditing || isCreatingNew ? (
                    <input
                      type="text"
                      value={editForm?.subject || ''}
                      onChange={(e) => handleFieldChange('subject', e.target.value)}
                      className="w-full px-3 py-2.5 bg-white border border-[var(--color-border-default)] rounded-lg text-sm text-[var(--color-text-primary)] focus:outline-none focus:border-[var(--color-border-focus)] transition-colors"
                    />
                  ) : (
                    <div className="px-3 py-2.5 bg-[var(--color-surface-panel)] border border-[var(--color-border-default)] rounded-lg text-sm text-[var(--color-text-primary)]">
                      {editForm?.subject || ''}
                    </div>
                  )}
                </div>

                {/* Field 4: Email Body */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="block text-xs font-bold text-[var(--color-text-secondary)] uppercase tracking-wider">
                      Email Body
                    </label>
                    {(isEditing || isCreatingNew) && (
                      <div className="flex gap-1.5">
                        {['{{first_name}}', '{{club_name}}', '{{membership_type}}'].map(v => (
                          <button
                            key={v}
                            type="button"
                            onClick={() => handleFieldChange('body', (editForm?.body || '') + v)}
                            className="px-2 py-0.5 rounded text-[10px] font-bold bg-gray-100 text-gray-600 hover:bg-[var(--color-surface-highlight)] hover:text-[var(--color-brand-primary)] transition-colors cursor-pointer font-mono"
                          >{v}</button>
                        ))}
                      </div>
                    )}
                  </div>
                  {isEditing || isCreatingNew ? (
                    <>
                      <textarea
                        value={editForm?.body || ''}
                        onChange={(e) => handleFieldChange('body', e.target.value)}
                        rows={16}
                        className="w-full px-4 py-3 bg-[#fafafa] border border-[var(--color-border-default)] rounded-lg text-sm text-[var(--color-text-primary)] focus:outline-none focus:border-[var(--color-border-focus)] transition-colors resize-y font-mono leading-relaxed"
                        placeholder="Enter your email template here. Use {{first_name}}, {{club_name}}, {{membership_type}} as variables."
                      />
                      <p className="text-[11px] text-[var(--color-text-muted)]">
                        Click a variable chip above to insert it at the end of the body, or type it manually.
                      </p>
                    </>
                  ) : (
                    <pre className="w-full px-4 py-3 bg-[var(--color-surface-panel)] border border-[var(--color-border-default)] rounded-lg text-sm text-[var(--color-text-primary)] font-mono leading-relaxed whitespace-pre-wrap">
                      {editForm?.body || ''}
                    </pre>
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Delete Confirmation Modal */}
      <Modal
        isOpen={showDeleteModal}
        onClose={() => setShowDeleteModal(false)}
        title="Delete Template"
        footer={
          <>
            <button
              onClick={() => setShowDeleteModal(false)}
              className="px-4 py-2 border border-[var(--color-border-default)] rounded-md text-sm font-medium text-[var(--color-text-primary)] hover:bg-gray-50 transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              onClick={handleDelete}
              className="px-4 py-2 text-white text-sm font-semibold rounded-md bg-red-600 hover:bg-red-700 transition-colors shadow-sm cursor-pointer"
            >
              Delete Template
            </button>
          </>
        }
      >
        <div className="text-sm text-[var(--color-text-primary)] space-y-2">
          <p>Are you sure you want to delete <strong>{selectedTemplate?.name}</strong>?</p>
          <p className="text-[var(--color-text-secondary)]">This action cannot be undone.</p>
        </div>
      </Modal>
    </div>
  );
}
