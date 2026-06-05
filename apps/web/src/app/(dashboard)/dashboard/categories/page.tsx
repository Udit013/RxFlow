'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { Tags, Plus, X, Pencil, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { api } from '@/lib/api'
import { cn } from '@/lib/utils'
import { AnimatedSection, PageHeader, SectionCard, EmptyState } from '@/components/ui'

const SWATCHES = ['#0c83d0', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#ec4899', '#84cc16', '#64748b']

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
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {Array.from({ length: 6 }).map((_, i) => <div key={i} className="card p-5"><div className="h-5 w-32 skeleton mb-2" /><div className="h-3 w-20 skeleton" /></div>)}
          </div>
        ) : categories.length === 0 ? (
          <SectionCard><EmptyState icon={Tags} title="No categories yet" description="Create categories like Antibiotics, Painkillers, Vitamins to organize your catalog." action={<button onClick={() => setEdit('new')} className="btn-primary"><Plus className="w-4 h-4" /> Add Category</button>} /></SectionCard>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {categories.map((c) => (
              <div key={c.id} className="cat-card card-hover p-5 group relative overflow-hidden">
                <div className="absolute left-0 top-0 bottom-0 w-1" style={{ background: c.color ?? '#64748b' }} />
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2.5">
                    <span className="w-9 h-9 rounded-lg flex items-center justify-center" style={{ background: `${c.color ?? '#64748b'}18`, color: c.color ?? '#64748b' }}>
                      <Tags className="w-4 h-4" />
                    </span>
                    <div>
                      <p className="font-semibold text-surface-900">{c.name}</p>
                      <p className="text-xs text-surface-500">{c.medicineCount} medicine{c.medicineCount === 1 ? '' : 's'}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button onClick={() => setEdit(c)} className="text-surface-400 hover:text-brand-600 p-1"><Pencil className="w-4 h-4" /></button>
                    <button onClick={() => window.confirm(`Delete "${c.name}"? Medicines keep their data but lose this category.`) && del.mutate(c.id)} className="text-surface-400 hover:text-danger-600 p-1"><Trash2 className="w-4 h-4" /></button>
                  </div>
                </div>
                {c.description && <p className="text-xs text-surface-500 mt-3">{c.description}</p>}
              </div>
            ))}
          </div>
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
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-elevated w-full max-w-md">
        <div className="flex items-center justify-between px-5 py-4 border-b border-surface-100">
          <h2 className="font-semibold">{isEdit ? 'Edit Category' : 'New Category'}</h2>
          <button onClick={onClose}><X className="w-4 h-4 text-surface-400" /></button>
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
                <button key={s} type="button" onClick={() => setValue('color', s)} className={cn('w-7 h-7 rounded-lg transition-transform', color === s ? 'ring-2 ring-offset-2 ring-surface-400 scale-110' : '')} style={{ background: s }} />
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
