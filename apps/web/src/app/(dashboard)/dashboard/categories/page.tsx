'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { Tags, Plus, X, Pencil, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { api } from '@/lib/api'
import { cn } from '@/lib/utils'
import { AnimatedSection, PageHeader, SectionCard, EmptyState } from '@/components/ui'

const SWATCHES = ['#0e5f52', '#d47f16', '#4a6fa5', '#c03b2d', '#74aa50', '#7d5a8c', '#3f8f9a', '#b4640a', '#77756b']

interface CategoryForm { name: string; description?: string; color?: string }

export default function CategoriesPage() {
  const queryClient = useQueryClient()
  const [edit, setEdit] = useState<'new' | any | null>(null)

  const { data, isLoading } = useQuery({
    queryKey: ['categories'],
    queryFn: () => api.get('/categories').then((r) => r.data),
  })
  const categories: any[] = data?.data ?? []

  const del = useMutation({
    mutationFn: (id: string) => api.delete(`/categories/${id}`),
    onSuccess: () => { toast.success('Category deleted'); queryClient.invalidateQueries({ queryKey: ['categories'] }) },
    onError: (e: any) => toast.error(e.response?.data?.error ?? 'Failed'),
  })

  return (
    <div className="space-y-6">
      <AnimatedSection immediate>
        <PageHeader
          icon={Tags}
          eyebrow="Catalog"
          title="Categories"
          description="Organize medicines into categories for faster search and reporting"
          actions={<button onClick={() => setEdit('new')} className="btn-primary"><Plus className="w-4 h-4" /> Add Category</button>}
        />
      </AnimatedSection>

      <AnimatedSection stagger=".cat-card">
        {isLoading ? (
          <div className="card divide-y divide-surface-100">
            {Array.from({ length: 5 }).map((_, i) => <div key={i} className="px-4 py-3.5 flex items-center gap-3"><div className="w-2.5 h-2.5 rounded-full skeleton" /><div className="h-3.5 w-40 skeleton" /></div>)}
          </div>
        ) : categories.length === 0 ? (
          <SectionCard><EmptyState icon={Tags} title="No categories yet" description="Create categories like Antibiotics, Painkillers, Vitamins to organize your catalog." action={<button onClick={() => setEdit('new')} className="btn-primary"><Plus className="w-4 h-4" /> Add Category</button>} /></SectionCard>
        ) : (
          <ul className="card divide-y divide-surface-100 overflow-hidden">
            {categories.map((c) => (
              <li key={c.id} className="group flex items-center gap-3 px-4 py-3 hover:bg-surface-50 transition-colors">
                <span aria-hidden="true" className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: c.color ?? '#77756b' }} />
                <div className="min-w-0 flex-1 sm:flex sm:items-baseline sm:gap-3">
                  <p className="text-[13px] font-medium text-surface-900 truncate">{c.name}</p>
                  {c.description && <p className="text-xs text-surface-500 truncate">{c.description}</p>}
                </div>
                <span className="text-xs text-surface-500 tabular-nums shrink-0">{c.medicineCount} medicine{c.medicineCount === 1 ? '' : 's'}</span>
                <div className="flex items-center gap-0.5 shrink-0 sm:opacity-0 sm:group-hover:opacity-100 sm:focus-within:opacity-100 transition-opacity">
                  <button type="button" aria-label={`Edit ${c.name}`} onClick={() => setEdit(c)} className="p-1.5 rounded-md text-surface-400 hover:text-surface-900 hover:bg-surface-100"><Pencil className="w-3.5 h-3.5" /></button>
                  <button type="button" aria-label={`Delete ${c.name}`} onClick={() => window.confirm(`Delete "${c.name}"? Medicines keep their data but lose this category.`) && del.mutate(c.id)} className="p-1.5 rounded-md text-surface-400 hover:text-danger-600 hover:bg-danger-50"><Trash2 className="w-3.5 h-3.5" /></button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </AnimatedSection>

      {edit && <CategoryModal existing={edit === 'new' ? undefined : edit} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); queryClient.invalidateQueries({ queryKey: ['categories'] }) }} />}
    </div>
  )
}

function CategoryModal({ existing, onClose, onSaved }: { existing?: any; onClose: () => void; onSaved: () => void }) {
  const isEdit = !!existing
  const { register, handleSubmit, watch, setValue, formState: { errors } } = useForm<CategoryForm>({
    defaultValues: existing ? { name: existing.name, description: existing.description ?? '', color: existing.color ?? SWATCHES[0] } : { color: SWATCHES[0] },
  })
  const color = watch('color')

  const mutation = useMutation({
    mutationFn: (d: CategoryForm) => isEdit ? api.patch(`/categories/${existing.id}`, d) : api.post('/categories', d),
    onSuccess: () => { toast.success(isEdit ? 'Updated' : 'Category created'); onSaved() },
    onError: (e: any) => toast.error(e.response?.data?.error ?? 'Failed'),
  })

  return (
    <div className="modal-overlay">
      <div className="modal-panel w-full max-w-md">
        <div className="modal-header">
          <h2 className="font-semibold">{isEdit ? 'Edit Category' : 'New Category'}</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="modal-close"><X className="w-4 h-4" /></button>
        </div>
        <form onSubmit={handleSubmit((d) => mutation.mutate(d))} className="p-5 space-y-3">
          <div>
            <label className="label">Name *</label>
            <input className="input" {...register('name', { required: true })} placeholder="Antibiotics, Painkillers..." />
            {errors.name && <p className="text-xs text-danger-600 mt-1">Required</p>}
          </div>
          <div>
            <label className="label">Description</label>
            <input className="input" {...register('description')} placeholder="Optional" />
          </div>
          <div>
            <label className="label">Color</label>
            <div className="flex flex-wrap gap-2">
              {SWATCHES.map((s) => (
                <button key={s} type="button" onClick={() => setValue('color', s)} aria-label={`Colour ${s}`} aria-pressed={color === s} className={cn('w-6 h-6 rounded-full transition-shadow', color === s ? 'ring-2 ring-offset-2 ring-surface-900' : 'hover:ring-2 hover:ring-offset-2 hover:ring-surface-300')} style={{ background: s }} />
              ))}
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2 border-t border-surface-100">
            <button type="button" onClick={onClose} className="btn-secondary">Cancel</button>
            <button type="submit" disabled={mutation.isPending} className="btn-primary">{mutation.isPending ? 'Saving...' : isEdit ? 'Save' : 'Create'}</button>
          </div>
        </form>
      </div>
    </div>
  )
}
