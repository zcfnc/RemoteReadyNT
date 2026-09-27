import type { ExerciseStage } from '../../types/data';
import { stages } from './dashboard';

export function ExerciseTimeline({ stage, onStageChange }: { stage: ExerciseStage; onStageChange: (stage: ExerciseStage) => void }) {
  return <div className="exercise-timeline" role="tablist" aria-label="Exercise stages">
    {stages.map((item, index) => <button className={item.id === stage ? 'active' : undefined} key={item.id} onClick={() => onStageChange(item.id)} role="tab" aria-selected={item.id === stage} type="button"><b>{index + 1}</b><span>{item.label}</span></button>)}
  </div>;
}
