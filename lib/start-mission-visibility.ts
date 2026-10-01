export function visibleStartMissionSteps<T extends { completed: boolean }>(
  steps: readonly T[],
  showCompleted: boolean,
): T[] {
  return showCompleted ? [...steps] : steps.filter((step) => !step.completed);
}
