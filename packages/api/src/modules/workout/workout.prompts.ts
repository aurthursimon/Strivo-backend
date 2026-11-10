/**
 * Prompt de geracao de plano de treino. Exige JSON puro e respeita o locale para
 * textos voltados ao usuario. Nunca gera orientacao medica/diagnostico.
 */

export interface WorkoutProfileInput {
  experience: string;
  daysPerWeek: number;
  healthConditions: string[];
  equipment: string;
  minutesPerSession: number;
}

function langRule(locale: string): string {
  const lang = locale.startsWith('pt')
    ? 'portugues do Brasil'
    : locale.startsWith('es')
      ? 'espanhol latino-americano neutro'
      : 'ingles';
  return `Todo texto voltado ao usuario (name, focusArea, exercise.name, instructions) deve estar em ${lang}.`;
}

const EXERCISE_SHAPE = `{
  "name": string,
  "category": "STRENGTH"|"CARDIO"|"FLEXIBILITY"|"HIIT"|"RECOVERY",
  "muscleGroups": [string],
  "sets": number (opcional),
  "reps": string (opcional, ex.: "8-12"),
  "durationSec": number (opcional),
  "restSec": number,
  "instructions": string,
  "difficulty": "beginner"|"intermediate"|"advanced"
}`;

export function buildWorkoutPlanPrompt(
  profile: WorkoutProfileInput,
  consultMode: boolean,
  locale: string,
): string {
  const safety = consultMode
    ? 'O usuario relatou condicoes que pedem cautela: priorize exercicios de baixo impacto, intensidade leve a moderada e descanso adequado. Nao inclua exercicios de alto impacto ou alta carga.'
    : '';

  return `Voce e um personal trainer. Gere um plano de treino semanal.

Perfil:
- Experiencia: ${profile.experience}
- Dias por semana: ${profile.daysPerWeek}
- Equipamento disponivel: ${profile.equipment}
- Minutos por sessao: ${profile.minutesPerSession}

${safety}
${langRule(locale)}
Respeite os minutos por sessao (estimatedMinutes proximo do alvo) e o numero de
dias por semana. Distribua grupos musculares de forma equilibrada.

Retorne SOMENTE JSON valido, sem markdown, no formato:
{
  "name": string,
  "days": [
    {
      "dayOfWeek": 1,
      "name": string,
      "focusArea": string,
      "estimatedMinutes": number,
      "exercises": [ ${EXERCISE_SHAPE} ]
    }
  ]
}
dayOfWeek: 1=segunda ... 7=domingo. Gere ${profile.daysPerWeek} dias de treino.`;
}
