# Prévisualisation de fichier à l'import

Avant validation d'un import, l'administrateur ne disposait d'aucun aperçu du
contenu réel du fichier : il devait deviner le type géométrique, la
projection, et choisir un champ identifiant unique sans connaître les données
sous-jacentes. Les composants décrits ici affichent un aperçu (métadonnées,
échantillon de lignes, emprise sur une carte) avant que l'import ne soit
validé, pour les sources fichier (GeoJSON, Shapefile, GeoPackage, CSV) comme
pour les sources PostGIS.

## Sommaire

- [Vue d'ensemble](#vue-densemble)
- [Endpoints](#endpoints)
- [Prévisualisation d'un nouveau fichier](#prévisualisation-dun-nouveau-fichier)
- [GeoPackage multi-couches](#geopackage-multi-couches)
- [Source déjà enregistrée](#source-déjà-enregistrée)
- [Composant d'affichage](#composant-daffichage)
- [Fichiers concernés](#fichiers-concernés)
- [Limites connues](#limites-connues)

## Vue d'ensemble

Le même composant d'affichage, `FilePreview.js`, est réutilisé par les deux
formulaires de source :

- `DataSourceFileFields.js` (sources fichier), alimenté par `useFilePreview`,
  avec en complément `GpkgLayerNameSelect` pour les GeoPackage ;
- `DataSourceDbFields.js` (source PostGIS), alimenté par `useSqlPreview`.

Dans les deux cas, la liste des champs renvoyée par la prévisualisation
alimente aussi `IdFieldSelect`, qui permet de choisir le champ identifiant
unique de la couche.

## Endpoints

| Endpoint | Usage |
|---|---|
| `POST geosource/file-preview/` | Prévisualise un fichier fraîchement téléversé, pas encore enregistré |
| `GET geosource/{id}/file-preview/` | Relit les métadonnées d'une source déjà enregistrée |
| `POST geosource/gpkg-layers/` | Liste les couches disponibles d'un GeoPackage avant de choisir laquelle prévisualiser |

Les deux endpoints de prévisualisation renvoient la même forme de réponse :
`record_count`, `column_count`, `geometry_type`, `geometry_type_name`,
`geometry_types`, `mixed_geometries`, `crs`, `fields` (nom + type), `features`
(jusqu'à 5 lignes d'échantillon), `bbox`, `file_size`.

## Prévisualisation d'un nouveau fichier

`file_preview` (`project/geosource/views.py`) reçoit le fichier en
multipart et choisit le parseur selon l'extension :

| Extension | Méthode | Détail |
|---|---|---|
| `.gpkg` | `_preview_ogr(is_gpkg=True)` | Ouvre la couche désignée par `layer_name`, ou la première si absente |
| `.zip` / `.shp` | `_preview_shapefile` | Ouvre l'archive via `open_zipped_shapefile_layer`, ou le fichier directement |
| `.geojson` / `.json` | `_preview_ogr(is_geojson=True)` | |
| `.csv` | `_preview_csv` | Parseur dédié, voir ci-dessous |

Pour les formats lus via GDAL (`_extract_layer_data`), quand le type
géométrique de la couche n'est pas déterminable directement (`Unknown`), une
détection de repli est tentée : un appel à `ogrinfo` (`OGR SQL`,
`SELECT DISTINCT OGR_GEOMETRY`) pour les formats OGR, une recherche par
expression régulière sur le fichier brut pour le GeoJSON. Si plusieurs types
de géométrie sont détectés, `mixed_geometries` est renvoyé à `true` et
`FilePreview.js` affiche un avertissement.

GDAL ne distingue pas nativement les booléens des entiers. Pour un
GeoPackage, `detect_boolean_fields` (`project/geosource/models.py`) est
utilisée. Pour les autres formats OGR, un champ entier est considéré booléen
si son échantillon ne contient que des `0`/`1`.

### Cas du CSV

`_preview_csv` est un parseur dédié à la prévisualisation, indépendant du
parseur utilisé au moment de l'import réel (`CSVSource.get_file_as_sheet`,
qui s'appuie sur `pyexcel`). Il reproduit néanmoins la même logique de
paramétrage : séparateur de champ, délimiteur de texte, séparateur décimal,
encodage, nombre de lignes à ignorer, présence d'en-tête, et extraction des
coordonnées (deux colonnes latitude/longitude, ou une colonne combinée avec
séparateur). Le type de chaque colonne (`int`, `float`, `boolean`, `str`) est
déduit de l'échantillon des 5 premières lignes de données. L'emprise (`bbox`)
est calculée à partir des coordonnées extraites, reprojetée en EPSG:4326 si un
système de coordonnées source différent est renseigné.

## GeoPackage multi-couches

`GpkgLayerNameSelect.js` interroge `gpkg-layers/` dès qu'un fichier `.gpkg`
est sélectionné, pour peupler un menu déroulant des couches disponibles
(présélectionne la première). `useFilePreview` attend qu'une couche soit
choisie avant de lancer la prévisualisation complète pour un GeoPackage :
tant que `layer_name` est vide, l'aperçu n'est pas déclenché.

## Source déjà enregistrée

`file_preview_saved` ne reparse pas le fichier : il relit les métadonnées
déjà stockées en base au moment du dernier import (`source.fields`, avec un
échantillon de valeurs par champ, `source.report.total` pour le nombre
d'entités, `source.geom_type`). L'emprise est recalculée depuis les données
importées (`get_layer().get_extent`) avec un repli sur le fichier source si
cette requête échoue.

`useSqlPreview.js` (utilisé pour les sources PostGIS, malgré son nom) ne fait
qu'appeler cet endpoint : contrairement aux sources fichier, une source
PostGIS n'a pas d'aperçu possible avant d'avoir été enregistrée et
rafraîchie au moins une fois, puisqu'il n'existe pas d'endpoint pour exécuter
la requête SQL à blanc. Le hook se redéclenche quand `updated_at` change,
c'est-à-dire après chaque rafraîchissement de la source.

## Composant d'affichage

`FilePreview.js` affiche, dans un panneau repliable : les métadonnées
(nombre de lignes, de colonnes, type géométrique, projection), une alerte en
cas de géométries mixtes, un tableau des 5 premières lignes (`MAX_DISPLAY`)
avec une ligne « + N lignes » au-delà, et une carte Mapbox GL (`BBoxMap`)
montrant l'emprise du fichier, ou un espace réservé si aucune emprise n'est
disponible. Pendant un rechargement, le contenu précédent reste affiché en
grisé (`oldContent`) plutôt que de disparaître, avec une barre de
progression indéterminée au-dessus ; au tout premier chargement, des
squelettes (`Skeleton`) sont affichés à la place.

## Fichiers concernés

| Fichier | Rôle |
|---|---|
| [`FilePreview.js`](./FilePreview.js) | Affichage de l'aperçu (métadonnées, table, carte) |
| [`useFilePreview.js`](./useFilePreview.js) | Prévisualisation d'un fichier téléversé, avec anti-rebond de 350 ms |
| [`useSqlPreview.js`](./useSqlPreview.js) | Relecture de l'aperçu d'une source PostGIS déjà enregistrée |
| [`GpkgLayerNameSelect.js`](./GpkgLayerNameSelect.js) | Sélecteur de couche pour un GeoPackage multi-couches |
| [`project/geosource/views.py`](../../../../../../project/geosource/views.py) | Endpoints `file-preview` (POST/GET) et `gpkg-layers` |
| [`project/geosource/models.py`](../../../../../../project/geosource/models.py) | `detect_boolean_fields`, `CSVSource.get_file_as_sheet` (import réel, pour comparaison) |

## Limites connues

- Le parseur CSV de la prévisualisation (`_preview_csv`, module `csv` de
  Python) est distinct de celui utilisé lors de l'import réel
  (`CSVSource.get_file_as_sheet`, `pyexcel`) : un comportement qui diffère
  entre les deux (gestion d'un cas de séparateur ou d'encodage particulier,
  par exemple) peut faire qu'un aperçu ne corresponde pas exactement au
  résultat de l'import.
- Il n'existe pas d'aperçu possible pour une source PostGIS avant sa
  première sauvegarde et son premier rafraîchissement : `useSqlPreview` ne
  fait que relire un aperçu déjà calculé, il n'exécute pas la requête SQL à
  blanc.
- Chaque changement de paramètre déclenche une reprévisualisation complète du
  fichier (après 350 ms sans nouvelle modification), sans mise en cache entre
  deux appels : envisageable sur de gros fichiers si la latence perçue devient
  un problème.
