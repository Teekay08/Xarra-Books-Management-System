import { useState, type FormEvent } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { PageHeader } from '../../components/PageHeader';

interface ContractTemplate {
  id: string;
  name: string;
  authorType: 'HYBRID' | 'TRADITIONAL';
  content: string;
  version: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

const cls = 'w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500';

export function ContractTemplates() {
  const queryClient = useQueryClient();
  const [showModal, setShowModal] = useState(false);
  const [editTemplate, setEditTemplate] = useState<ContractTemplate | null>(null);
  const [filterType, setFilterType] = useState<string>('');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['contract-templates', filterType],
    queryFn: () => {
      const params = new URLSearchParams();
      if (filterType) params.set('authorType', filterType);
      return api<{ data: ContractTemplate[] }>(`/authors/contract-templates?${params}`);
    },
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => api(`/authors/contract-templates/${id}`, { method: 'DELETE' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['contract-templates'] }),
  });

  const templates = data?.data ?? [];
  const activeTemplates = templates.filter(t => t.isActive);
  const inactiveTemplates = templates.filter(t => !t.isActive);

  return (
    <div>
      <PageHeader
        title="Contract Templates"
        subtitle="Manage standard contract terms for Traditional and Hybrid authors"
        action={
          <button
            onClick={() => { setEditTemplate(null); setShowModal(true); }}
            className="rounded-md bg-green-700 px-4 py-2 text-sm font-medium text-white hover:bg-green-800"
          >
            New Template
          </button>
        }
      />

      <div className="mb-4 flex gap-2">
        <button
          onClick={() => setFilterType('')}
          className={`rounded-md px-3 py-1.5 text-sm font-medium ${!filterType ? 'bg-green-700 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
        >
          All
        </button>
        <button
          onClick={() => setFilterType('TRADITIONAL')}
          className={`rounded-md px-3 py-1.5 text-sm font-medium ${filterType === 'TRADITIONAL' ? 'bg-green-700 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
        >
          Traditional
        </button>
        <button
          onClick={() => setFilterType('HYBRID')}
          className={`rounded-md px-3 py-1.5 text-sm font-medium ${filterType === 'HYBRID' ? 'bg-green-700 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
        >
          Hybrid
        </button>
      </div>

      {isLoading ? (
        <div className="py-12 text-center text-gray-400">Loading...</div>
      ) : (
        <div className="space-y-4">
          {activeTemplates.length === 0 && inactiveTemplates.length === 0 && (
            <div className="rounded-lg border-2 border-dashed border-gray-300 p-12 text-center">
              <p className="text-gray-500 mb-2">No contract templates yet.</p>
              <p className="text-sm text-gray-400">Create templates with standard terms for Traditional and Hybrid author contracts.</p>
            </div>
          )}

          {activeTemplates.map((t) => (
            <TemplateCard
              key={t.id}
              template={t}
              isExpanded={expandedId === t.id}
              onToggle={() => setExpandedId(expandedId === t.id ? null : t.id)}
              onEdit={() => { setEditTemplate(t); setShowModal(true); }}
              onDeactivate={() => {
                if (confirm(`Deactivate "${t.name}"? It will no longer be available for new contracts.`)) {
                  deleteMut.mutate(t.id);
                }
              }}
            />
          ))}

          {inactiveTemplates.length > 0 && (
            <>
              <h3 className="text-sm font-medium text-gray-500 pt-4">Inactive Templates</h3>
              {inactiveTemplates.map((t) => (
                <TemplateCard
                  key={t.id}
                  template={t}
                  isExpanded={expandedId === t.id}
                  onToggle={() => setExpandedId(expandedId === t.id ? null : t.id)}
                  onEdit={() => { setEditTemplate(t); setShowModal(true); }}
                />
              ))}
            </>
          )}
        </div>
      )}

      {showModal && (
        <TemplateModal
          template={editTemplate}
          onClose={() => { setShowModal(false); setEditTemplate(null); }}
          onSuccess={() => {
            setShowModal(false);
            setEditTemplate(null);
            queryClient.invalidateQueries({ queryKey: ['contract-templates'] });
          }}
        />
      )}
    </div>
  );
}

function TemplateCard({
  template,
  isExpanded,
  onToggle,
  onEdit,
  onDeactivate,
}: {
  template: ContractTemplate;
  isExpanded: boolean;
  onToggle: () => void;
  onEdit: () => void;
  onDeactivate?: () => void;
}) {
  return (
    <div className={`rounded-lg border bg-white ${template.isActive ? 'border-gray-200' : 'border-gray-100 opacity-60'}`}>
      <div className="p-5">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-3">
            <h3 className="font-medium text-gray-900">{template.name}</h3>
            <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
              template.authorType === 'TRADITIONAL'
                ? 'bg-blue-100 text-blue-700'
                : 'bg-purple-100 text-purple-700'
            }`}>
              {template.authorType}
            </span>
            <span className="text-xs text-gray-400">v{template.version}</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={onToggle}
              className="text-sm text-gray-500 hover:text-gray-700"
            >
              {isExpanded ? 'Collapse' : 'Preview'}
            </button>
            <button
              onClick={onEdit}
              className="rounded-md border border-gray-300 px-3 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50"
            >
              Edit
            </button>
            {template.isActive && onDeactivate && (
              <button
                onClick={onDeactivate}
                className="rounded-md border border-red-200 px-3 py-1 text-xs font-medium text-red-600 hover:bg-red-50"
              >
                Deactivate
              </button>
            )}
          </div>
        </div>
        <p className="text-xs text-gray-400">
          Last updated: {new Date(template.updatedAt).toLocaleDateString('en-ZA', {
            day: 'numeric', month: 'short', year: 'numeric',
          })}
        </p>
      </div>

      {isExpanded && (
        <div className="border-t border-gray-200 p-5">
          <div
            className="prose prose-sm max-w-none text-gray-700"
            dangerouslySetInnerHTML={{ __html: template.content }}
          />
        </div>
      )}
    </div>
  );
}

function TemplateModal({
  template,
  onClose,
  onSuccess,
}: {
  template: ContractTemplate | null;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const isEdit = !!template;
  const [content, setContent] = useState(template?.content ?? DEFAULT_TRADITIONAL_TEMPLATE);
  const [authorType, setAuthorType] = useState<string>(template?.authorType ?? 'TRADITIONAL');

  const mutation = useMutation({
    mutationFn: (body: Record<string, unknown>) => {
      if (isEdit) {
        return api(`/authors/contract-templates/${template!.id}`, {
          method: 'PATCH',
          body: JSON.stringify(body),
        });
      }
      return api('/authors/contract-templates', {
        method: 'POST',
        body: JSON.stringify(body),
      });
    },
    onSuccess,
  });

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    mutation.mutate({
      name: fd.get('name') as string,
      authorType: fd.get('authorType') as string,
      content,
      version: fd.get('version') as string || '1.0',
      ...(isEdit && template ? { isActive: template.isActive } : {}),
    });
  }

  // When author type changes and content is a default template, swap it
  function handleTypeChange(newType: string) {
    setAuthorType(newType);
    if (content === DEFAULT_TRADITIONAL_TEMPLATE || content === DEFAULT_HYBRID_TEMPLATE) {
      setContent(newType === 'TRADITIONAL' ? DEFAULT_TRADITIONAL_TEMPLATE : DEFAULT_HYBRID_TEMPLATE);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-4xl mx-4 max-h-[95vh] flex flex-col">
        <div className="p-5 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">
            {isEdit ? 'Edit Contract Template' : 'New Contract Template'}
          </h2>
        </div>
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-5 space-y-4">
          <div className="grid grid-cols-3 gap-4">
            <div className="col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">Template Name *</label>
              <input
                name="name"
                required
                defaultValue={template?.name ?? ''}
                className={cls}
                placeholder="e.g. Standard Traditional Publishing Agreement"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Version</label>
              <input
                name="version"
                defaultValue={template?.version ?? '1.0'}
                className={cls}
                placeholder="1.0"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Author Type *</label>
            <select
              name="authorType"
              required
              value={authorType}
              onChange={(e) => handleTypeChange(e.target.value)}
              className={cls}
            >
              <option value="TRADITIONAL">Traditional</option>
              <option value="HYBRID">Hybrid</option>
            </select>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-sm font-medium text-gray-700">Contract Terms (HTML) *</label>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setContent(authorType === 'TRADITIONAL' ? DEFAULT_TRADITIONAL_TEMPLATE : DEFAULT_HYBRID_TEMPLATE)}
                  className="text-xs text-green-700 hover:text-green-800 font-medium"
                >
                  Load Default Template
                </button>
              </div>
            </div>
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              rows={20}
              className={`${cls} font-mono text-xs`}
              placeholder="Enter contract terms in HTML format..."
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Preview</label>
            <div className="rounded-md border border-gray-200 p-4 max-h-60 overflow-y-auto bg-gray-50">
              <div
                className="prose prose-sm max-w-none"
                dangerouslySetInnerHTML={{ __html: content }}
              />
            </div>
          </div>

          {mutation.isError && (
            <div className="rounded-md bg-red-50 p-3 text-sm text-red-700">
              {(mutation.error as Error).message}
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose}
              className="rounded-md border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50">
              Cancel
            </button>
            <button type="submit" disabled={mutation.isPending}
              className="rounded-md bg-green-700 px-4 py-2 text-sm font-medium text-white hover:bg-green-800 disabled:opacity-50">
              {mutation.isPending ? 'Saving...' : isEdit ? 'Update Template' : 'Create Template'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

const DEFAULT_TRADITIONAL_TEMPLATE = `<h2>TRADITIONAL PUBLISHING AGREEMENT</h2>

<p>This Publishing Agreement ("Agreement") is entered into between <strong>Xarra Books (Pty) Ltd</strong> ("the Publisher") and the Author named on the contract details above ("the Author").</p>

<h3>1. GRANT OF RIGHTS</h3>
<p>The Author grants to the Publisher the exclusive right to publish, distribute, and sell the Work identified in this contract in all formats (print, e-book, audiobook) throughout the Republic of South Africa and internationally.</p>

<h3>2. TERM</h3>
<p>This Agreement shall commence on the Start Date and remain in force for the period specified, unless terminated earlier in accordance with this Agreement.</p>

<h3>3. MANUSCRIPT AND PUBLICATION</h3>
<p>3.1 The Author shall deliver the completed manuscript in a form acceptable to the Publisher by the agreed deadline.</p>
<p>3.2 The Publisher shall have editorial control over the Work, including editing, design, and format decisions.</p>
<p>3.3 The Publisher shall use commercially reasonable efforts to publish the Work within twelve (12) months of acceptance of the final manuscript.</p>

<h3>4. ROYALTIES</h3>
<p>4.1 The Publisher shall pay the Author royalties at the rates specified in the contract details above.</p>
<p>4.2 Royalties shall be calculated on the net receipts from sales of the Work.</p>
<p>4.3 Royalty statements and payments shall be made according to the payment frequency specified in the contract details.</p>

<h3>5. ADVANCE</h3>
<p>5.1 If an advance is specified, it shall be paid upon signing of this Agreement.</p>
<p>5.2 The advance is non-refundable but shall be recouped from royalties earned before any royalty payments are made to the Author.</p>

<h3>6. COPYRIGHT AND INTELLECTUAL PROPERTY</h3>
<p>6.1 Copyright in the Work shall remain with the Author.</p>
<p>6.2 The Publisher is granted an exclusive licence to exploit the Work for the duration of this Agreement.</p>

<h3>7. AUTHOR WARRANTIES</h3>
<p>The Author warrants that:</p>
<ul>
  <li>The Work is original and does not infringe any copyright or other rights.</li>
  <li>The Work has not been previously published in the territory covered by this Agreement.</li>
  <li>The Author has full power and authority to enter into this Agreement.</li>
  <li>The Work does not contain any defamatory, libellous, or unlawful material.</li>
</ul>

<h3>8. PUBLISHER OBLIGATIONS</h3>
<p>The Publisher shall:</p>
<ul>
  <li>Bear all costs of publication including editing, design, printing, and distribution.</li>
  <li>Market and promote the Work using commercially reasonable efforts.</li>
  <li>Maintain accurate sales records and make them available to the Author upon request.</li>
  <li>Provide the Author with complimentary copies as agreed.</li>
</ul>

<h3>9. TERMINATION</h3>
<p>9.1 Either party may terminate this Agreement by giving ninety (90) days written notice.</p>
<p>9.2 Upon termination, all rights granted shall revert to the Author, subject to the Publisher's right to sell existing stock.</p>

<h3>10. GOVERNING LAW</h3>
<p>This Agreement shall be governed by and construed in accordance with the laws of the Republic of South Africa.</p>

<p><em>By signing this contract, both parties agree to be bound by the terms and conditions set out above and in the contract details.</em></p>`;

const DEFAULT_HYBRID_TEMPLATE = `<h2>HYBRID PUBLISHING AGREEMENT</h2>

<p>This Hybrid Publishing Agreement ("Agreement") is entered into between <strong>Xarra Books (Pty) Ltd</strong> ("the Publisher") and the Author named on the contract details above ("the Author").</p>

<h3>1. NATURE OF AGREEMENT</h3>
<p>This is a hybrid publishing arrangement whereby the Author contributes to certain publication costs in exchange for higher royalty rates and greater creative control over the Work.</p>

<h3>2. GRANT OF RIGHTS</h3>
<p>The Author grants to the Publisher a non-exclusive licence to publish, distribute, and sell the Work identified in this contract in all formats (print, e-book, audiobook) throughout the Republic of South Africa and internationally.</p>

<h3>3. TERM</h3>
<p>This Agreement shall commence on the Start Date and remain in force for the period specified, unless terminated earlier in accordance with this Agreement.</p>

<h3>4. AUTHOR CONTRIBUTION</h3>
<p>4.1 The Author shall contribute towards the costs of publication as separately agreed and invoiced by the Publisher.</p>
<p>4.2 The Author's contribution covers: professional editing, cover design, interior layout, ISBN assignment, and initial print run.</p>
<p>4.3 The Author's contribution does not constitute a purchase of services — the Publisher retains responsibility for quality and professional standards.</p>

<h3>5. ROYALTIES</h3>
<p>5.1 In recognition of the Author's contribution, the Publisher shall pay enhanced royalties at the rates specified in the contract details above.</p>
<p>5.2 Royalties shall be calculated on the net receipts from sales of the Work.</p>
<p>5.3 Royalty statements and payments shall be made according to the payment frequency specified in the contract details.</p>

<h3>6. CREATIVE CONTROL</h3>
<p>6.1 The Author shall have approval rights over the final cover design and interior layout.</p>
<p>6.2 The Publisher shall consult with the Author on marketing strategy and pricing decisions.</p>
<p>6.3 Editorial suggestions by the Publisher are advisory; final editorial decisions rest with the Author.</p>

<h3>7. ADVANCE</h3>
<p>7.1 If an advance is specified, it shall be paid as per the schedule in the contract details.</p>
<p>7.2 The advance shall be recouped from royalties earned before further royalty payments are made.</p>

<h3>8. COPYRIGHT AND INTELLECTUAL PROPERTY</h3>
<p>8.1 Copyright in the Work shall remain with the Author at all times.</p>
<p>8.2 The Author retains the right to exploit the Work through other channels not covered by this Agreement.</p>

<h3>9. AUTHOR WARRANTIES</h3>
<p>The Author warrants that:</p>
<ul>
  <li>The Work is original and does not infringe any copyright or other rights.</li>
  <li>The Author has full power and authority to enter into this Agreement.</li>
  <li>The Work does not contain any defamatory, libellous, or unlawful material.</li>
</ul>

<h3>10. PUBLISHER OBLIGATIONS</h3>
<p>The Publisher shall:</p>
<ul>
  <li>Provide professional editing, design, and production services.</li>
  <li>Distribute the Work through its established channels including bookstores and online retailers.</li>
  <li>List and market the Work in its catalogue.</li>
  <li>Maintain accurate sales records accessible to the Author.</li>
  <li>Provide the Author with complimentary copies as agreed.</li>
</ul>

<h3>11. TERMINATION</h3>
<p>11.1 Either party may terminate this Agreement by giving sixty (60) days written notice.</p>
<p>11.2 Upon termination, all rights revert to the Author immediately.</p>
<p>11.3 The Author's contribution is non-refundable upon termination after publication.</p>

<h3>12. GOVERNING LAW</h3>
<p>This Agreement shall be governed by and construed in accordance with the laws of the Republic of South Africa.</p>

<p><em>By signing this contract, both parties agree to be bound by the terms and conditions set out above and in the contract details.</em></p>`;
