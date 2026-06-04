import type { LucideIcon } from "lucide-react";

interface Stat {
  label: string;
  value: string;
  note: string;
}

interface ModulePageProps {
  title: string;
  eyebrow: string;
  description: string;
  icon: LucideIcon;
  stats?: Stat[];
  actions?: string[];
}

export function ModulePage({
  title,
  eyebrow,
  description,
  icon: Icon,
  stats = [],
  actions = [],
}: ModulePageProps) {
  return (
    <div className="space-y-6">
      <section className="flex flex-col gap-4 border-b border-emerald-900/10 pb-6 md:flex-row md:items-center md:justify-between">
        <div className="flex items-start gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-md bg-emerald-700 text-white">
            <Icon className="h-6 w-6" />
          </div>
          <div>
            <p className="text-xs font-semibold uppercase text-lime-700">{eyebrow}</p>
            <h1 className="mt-1 text-2xl font-semibold text-emerald-950">{title}</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-600">{description}</p>
          </div>
        </div>
      </section>

      {stats.length > 0 ? (
        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {stats.map((stat) => (
            <article key={stat.label} className="rounded-md border border-emerald-900/10 bg-white p-4 shadow-sm">
              <p className="text-xs font-medium uppercase text-zinc-500">{stat.label}</p>
              <p className="mt-3 text-2xl font-semibold text-emerald-950">{stat.value}</p>
              <p className="mt-1 text-sm text-zinc-500">{stat.note}</p>
            </article>
          ))}
        </section>
      ) : null}

      {actions.length > 0 ? (
        <section className="rounded-md border border-emerald-900/10 bg-white p-4 shadow-sm">
          <h2 className="text-sm font-semibold text-emerald-950">Build Queue</h2>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {actions.map((action) => (
              <div key={action} className="rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-700">
                {action}
              </div>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
