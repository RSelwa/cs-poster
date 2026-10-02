// team-colors.ts — couleur d'une équipe, choisie à la main dans team-colors.json (par identifiant d'équipe bo3.gg).
// Équipe absente du fichier → null → palette par défaut.

import TEAMS from './team-colors.json' with { type: 'json' };

type TeamColors = { id: number; name: string; primary: string; secondary: string };

const BY_ID = new Map((TEAMS as TeamColors[]).map((t) => [t.id, t]));

export const teamColors = (teams: ({ id: number } | undefined)[]) => teams.map((t) => (t && BY_ID.get(t.id)?.primary) || null);
