import { buildWorkoutPlanPrompt } from '../workout.prompts';
import { WorkoutSafetyService } from '../workout.safety';

const profile = {
  experience: 'beginner',
  daysPerWeek: 3,
  healthConditions: [],
  equipment: 'home',
  minutesPerSession: 30,
};

describe('workout localization', () => {
  it('requests Spanish user-facing plan content', () => {
    expect(buildWorkoutPlanPrompt(profile, false, 'es-MX')).toContain(
      'espanhol latino-americano neutro',
    );
  });

  it('returns the safety block in Spanish', () => {
    expect(new WorkoutSafetyService().blockedMessage('es')).toContain(
      'La generación del entrenamiento',
    );
  });
});
