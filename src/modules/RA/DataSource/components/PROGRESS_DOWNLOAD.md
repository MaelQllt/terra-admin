# Progression d'import et téléchargement du fichier source

Le rafraîchissement d'une source (import initial ou resynchronisation)
s'exécute en tâche de fond et peut prendre du temps sur un gros fichier. Ce
document couvre deux éléments annexes à l'import, indépendants l'un de
l'autre : la barre de progression affichée pendant un rafraîchissement, et le
bouton qui permet de retélécharger le fichier source déjà importé.

## Sommaire

- [Barre de progression](#barre-de-progression)
- [Téléchargement du fichier source](#téléchargement-du-fichier-source)
- [Fichiers concernés](#fichiers-concernés)
- [Limites connues](#limites-connues)

## Barre de progression

`ReportTab.js` affiche l'onglet « Rapport » du formulaire de source
(visible dès qu'un premier rafraîchissement a eu lieu,
`report?.status >= 0`, câblé dans `DataSourceTabbedForm.js`). Il commence par
`SyncProgress`, affiché uniquement pendant qu'un rafraîchissement est en
cours.

### Déclenchement et rafraîchissement des données

`ReportTab` interroge `geosource/{id}` toutes les 2 secondes
(`useDataProvider().getOne`) tant que le statut de la source
(`Source.Status`, exposé côté frontend par `sourceStatus` dans
`DataSourceStatus.js`) vaut `pending` (1) ou `in_progress` (3), soit
`REFRESHING_STATUSES = [1, 3]` côté frontend. Dès que le statut repasse à
`done` (2), le polling s'arrête et la barre disparaît.

À ne pas confondre avec le statut du rapport (`SourceReporting.Status` :
`success`/`error`/`warning`/`pending`), qui décrit le résultat du dernier
rafraîchissement terminé, affiché plus bas dans le même onglet.

### Calcul du pourcentage

```js
const processed = (report.added_lines || 0) + (report.modified_lines || 0);
const percent = total > 0 ? Math.min(100, Math.round((processed / total) * 100)) : 0;
```

Tant que `total` n'est pas encore connu (juste après le déclenchement du
rafraîchissement, avant que le fichier n'ait été lu), la barre reste
indéterminée avec un message d'attente. Dès que `total` est disponible, elle
passe en mode déterminé.

Côté backend (`Source._refresh_data`, `project/geosource/models.py`),
`report.total` est renseigné dès que les enregistrements du fichier ont été
lus, avant le traitement ligne à ligne. Pendant la boucle d'import,
`added_lines` et `modified_lines` ne sont sauvegardés en base qu'à
intervalle régulier plutôt qu'à chaque ligne :

```python
update_interval = max(1, len(records) // 100)
# ...
if row_count % update_interval == 0:
    self.report.added_lines = added_rows
    self.report.modified_lines = modified_rows
    self.report.save(update_fields=["added_lines", "modified_lines"])
```

`update_interval` vaut environ 1 % du nombre total d'enregistrements (au
minimum 1, pour les fichiers de moins de 100 lignes). Ce choix limite le
nombre d'écritures en base sur un très gros import, au prix d'une
progression affichée par paliers plutôt que ligne par ligne.

## Téléchargement du fichier source

`DownloadSourceFileButton.js` est affiché à côté du nom du fichier courant,
en mode édition d'une source déjà enregistrée (`DataSourceFileFields.js`,
`DataSourceCSVFields.js`). Au clic, il récupère le fichier en `blob` via
`geosource/{id}/download/`, crée une URL objet et un lien `<a download>`
temporaire pour déclencher le téléchargement navigateur, puis révoque cette
URL. L'icône passe brièvement à une coche pendant 3 secondes après un
téléchargement réussi ; une notification d'erreur s'affiche en cas d'échec.

Côté backend, l'action `download` (`project/geosource/views.py`) renvoie le
fichier stocké tel quel (`FileResponse`, `as_attachment=True`), avec son nom
d'origine restauré via `strip_storage_suffix` : Django ajoute un suffixe
aléatoire au nom du fichier stocké sur disque en cas de collision de nom, ce
suffixe est retiré avant de proposer le fichier au téléchargement.

## Fichiers concernés

| Fichier | Rôle |
|---|---|
| [`ReportTab.js`](./ReportTab.js) | Onglet rapport, `SyncProgress`, polling du statut de rafraîchissement |
| [`DataSourceStatus.js`](./DataSourceStatus.js) | Correspondance entre les codes de statut backend et les libellés/traductions |
| [`DownloadSourceFileButton.js`](./DownloadSourceFileButton.js) | Bouton de téléchargement du fichier source |
| [`DataSourceTabbedForm.js`](./DataSourceTabbedForm.js) | Câblage de l'onglet rapport (`report`, `status`, `sourceId`) |
| [`project/geosource/models.py`](../../../../../../project/geosource/models.py) | `Source._refresh_data` : mise à jour progressive du rapport pendant l'import |
| [`project/geosource/views.py`](../../../../../../project/geosource/views.py) | Action `download` |

## Limites connues

- Le polling se fait à intervalle fixe de 2 secondes, quelle que soit la
  taille du fichier en cours d'import, plutôt que d'adapter la fréquence à la
  durée estimée du rafraîchissement.
- Aucun moyen d'annuler un rafraîchissement en cours depuis cette interface.
- Le bouton de téléchargement renvoie le fichier tel qu'il a été importé à
  l'origine, pas un export des données actuellement en base : si la couche a
  été modifiée depuis (édition manuelle d'entités, par exemple), le fichier
  téléchargé ne reflète plus nécessairement l'état actuel de la couche.
