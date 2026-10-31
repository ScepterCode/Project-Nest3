import { Layers } from 'lucide-react';
import { HomeProgramme } from '@/lib/home';

/** The programmes someone's classes belong to, above their home page. */
export function ProgrammeLine({ programmes }: { programmes: HomeProgramme[] }) {
  return (
    <p className="flex items-center gap-2 text-sm text-muted-foreground">
      <Layers className="h-4 w-4 shrink-0 text-primary" aria-hidden />
      <span className="truncate">
        {programmes.map((p, i) => (
          <span key={p.id}>
            {i > 0 && ' · '}
            <span className="font-medium text-foreground">{p.name}</span>
          </span>
        ))}
      </span>
    </p>
  );
}
