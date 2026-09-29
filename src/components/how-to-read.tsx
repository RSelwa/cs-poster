export const HowToRead = () => (
  <details className="mt-5 border-t pt-3 text-[#3c4640]">
    <summary className="cursor-pointer font-semibold text-foreground">Comment lire l’affiche</summary>
    <ul className="mt-2 list-disc space-y-1 pl-4.5">
      <li>Toutes les maps du match sont mises bout à bout sur une grille : la première case est le premier round, la dernière est le dernier round de la dernière map.</li>
      <li>Chaque kill est un point de départ. Les traits de l’équipe de gauche partent vers la gauche, ceux de l’équipe de droite vers la droite.</li>
      <li>La longueur des traits suit l’ADR de l’équipe. La densité suit la part de rounds gagnés sur tout le match.</li>
      <li>Les rounds clés (fins de map, dernier round, longues séries cassées) attirent les traits, sans aucun marqueur visible.</li>
      <li>Le drame (écart final, prolongation, remontée, changements de leader, suspense de la série) transforme l’attraction en tourbillon.</li>
    </ul>
    <p className="mt-2"><strong>Limite :</strong> bo3.gg donne le nombre de kills de chaque équipe par round, pas leur heure : leur position dans le round est tirée au hasard (même graine, même tirage).</p>
  </details>
);
