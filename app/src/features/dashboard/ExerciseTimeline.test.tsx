import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ExerciseTimeline } from './ExerciseTimeline';

describe('ExerciseTimeline', () => {
  it('switches to the requested exercise stage', async () => {
    const user = userEvent.setup();
    const onStageChange = vi.fn();
    render(<ExerciseTimeline onStageChange={onStageChange} stage="48_hours_before_simulated_impact" />);
    await user.click(screen.getByRole('tab', { name: /simulated outcome/i }));
    expect(onStageChange).toHaveBeenCalledWith('simulated_impact_outcome');
  });
});
