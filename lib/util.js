const NIVEAUX_INT = {
  Crise: 5,
  'Alerte renforcée': 4,
  Alerte: 3,
  Vigilance: 2
}

export function getNiveau(niveauAlerte) {
  return niveauAlerte in NIVEAUX_INT ? NIVEAUX_INT[niveauAlerte] : 1
}

export function getNiveauInversed(niveauAlerte) {
  return Object.keys(NIVEAUX_INT).find(key => NIVEAUX_INT[key] === niveauAlerte)
}

export function getTypePrio(value) {
  if (value === 'Affichage Prio Eau Sou') {
    return 'SOU'
  }

  if (value === 'Affichage Prio Eau Sup') {
    return 'SUP'
  }
}

export function computeZoneScore(zone, isIntersecting, typePrio) {
  return (typePrio && zone.type === typePrio ? 10 : 0) // Bonus type prioritaire (règle de gestion)
  + getNiveau(zone.niveauAlerte) // Bonus de niveau d'alerte
  + (isIntersecting ? 1 : 0) // Bonus intersection
  + (zone.type === 'SOU' ? 0.1 : 0) // Bonus SOU en dernier recours
}
