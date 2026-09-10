# Éditeur de style gradué

Ce dossier regroupe les composants qui permettent de configurer un style gradué
pour une couche : choix du champ, méthode de discrétisation, nombre de classes
et palette de couleurs. Avant l'arrivée de `geo_api`, aucune de ces étapes ne
disposait d'aide visuelle : l'administrateur choisissait des bornes de classes
sans connaître la distribution du champ, et sans aperçu du résultat avant
application du style sur la carte. Les composants décrits ici s'appuient sur
`geo_api` pour combler ce manque : statistiques descriptives, histogramme de
distribution, prévisualisation de la discrétisation choisie et sélection de
palette normalisée.

## Sommaire

- [Vue d'ensemble](#vue-densemble)
- [Endpoints `geo_api` utilisés](#endpoints-geo_api-utilisés)
- [Résumé statistique](#résumé-statistique)
- [Distribution](#distribution)
- [Discrétisation](#discrétisation)
- [Palettes](#palettes)
- [Fichiers concernés](#fichiers-concernés)
- [Limites connues](#limites-connues)

## Vue d'ensemble

`GraduateValue.js` est le point d'entrée. Il assemble :

- le sélecteur de méthode de discrétisation et le nombre de classes ;
- le champ de palette (`DicopalField`, passé en `Component`) ;
- trois panneaux repliables (`Accordion`) : résumé statistique
  (`StatsPreview`), distribution (`DistribPreview`) et prévisualisation de la
  discrétisation (`DiscretPreview`).

Les trois panneaux partagent le même champ sélectionné (`${path}.field`) et se
rafraîchissent indépendamment dès que ce champ, la méthode ou le nombre de
classes change.

## Endpoints `geo_api` utilisés

| Endpoint | Usage | Composant |
|---|---|---|
| `GET geo-api/{layer}/feature/stats/{field}/` | Statistiques descriptives | `StatsPreview.js` |
| `GET geo-api/{layer}/feature/stats/{field}/distribution/` | Histogramme, boxplot, échantillon | `DistribPreview.js` |
| `GET geo-api/{layer}/feature/discretize/{field}/?method=...&classes=...` | Bornes de classes + effectifs | `DiscretPreview.js` |

Les trois endpoints reposent sur `cast_numeric` (`project/geo_api/filters.py`),
qui caste la propriété JSON du champ en float de façon sûre. Une valeur non
numérique n'échoue pas la requête : elle devient `NULL` côté SQL et est exclue
du calcul plutôt que de remonter une erreur.

## Résumé statistique

`StatsPreview.js` interroge `stats/{field}/` et affiche un tableau simple :
nombre d'entités, minimum, maximum, moyenne, médiane, écart-type.

Côté backend (`project/geo_api/views/stats.py`, `StatsMixin.stats`), l'ensemble
de ces valeurs est calculé en une seule requête d'agrégation Django
(`Min`, `Max`, `Avg`, `Sum`, `Count`, `StdDev`), complétée par une classe
`Quantile` maison qui s'appuie sur `PERCENTILE_CONT` pour la médiane et les
premier/troisième quartiles :

```python
class Quantile(Aggregate):
    function = "PERCENTILE_CONT"
    output_field = FloatField()
    template = "%(function)s(%(quantile)s) WITHIN GROUP (ORDER BY %(expressions)s)"
```

## Distribution

`DistribPreview.js` interroge `stats/{field}/distribution/` et transmet le
résultat à `DistribGraph.js`, qui compose avec Observable Plot un histogramme,
un boxplot et un nuage de points (jitter) représentant un échantillon des
valeurs.

Côté backend (`_compute_fd_bins`), la largeur des classes de l'histogramme est
calculée automatiquement par la règle de Freedman-Diaconis à partir de l'écart
interquartile, plutôt que fixée arbitrairement, avec un plafond de 100 classes.
Le boxplot renvoie le résumé à cinq nombres (min, q1, médiane, q3, max).
L'échantillon de valeurs est limité à 1000 points : au-delà, un tirage
aléatoire est effectué directement en SQL via la fonction `Random()`, plutôt
que de récupérer l'ensemble des valeurs pour les sous-échantillonner côté
application.

## Discrétisation

`DiscretPreview.js` interroge `discretize/{field}/` à chaque changement de
méthode, de nombre de classes ou de bornes manuelles, et compose trois
sous-composants :

- `ClassifGraph.js` : histogramme des classes avec des repères verticaux pour
  la moyenne, la médiane et l'écart-type ;
- `ClassifBornes.js` : liste textuelle des intervalles de classes ;
- `ClassifBucket.js` : bande horizontale colorée par classe, avec l'effectif
  affiché dans chaque segment.

### Méthodes disponibles

Le dispatch des méthodes se fait dans `project/terra_layer/style/utils.py`
(fonction `discretize`) et dans `project/geo_api/views/discretize.py` pour le
mode manuel :

| Méthode | Implémentation | Remarque |
|---|---|---|
| `jenks` | `ST_ClusterKMeans` (PostGIS) | Méthode historique, choisie par défaut côté backend si aucun paramètre `method` n'est fourni |
| `jenks_kmeans1d` | Bibliothèque C `kmeans1d`, calcul en mémoire | Implémentation plus récente, plus fidèle aux outils de référence (Magrit, QGIS) que `ST_ClusterKMeans` |
| `quantile` | `ntile()` (fenêtre SQL) | |
| `equal_interval` | Calcul direct min/max | |
| `manual` | Bornes fournies par l'utilisateur | Voir ci-dessous |

Les deux implémentations de Jenks coexistent volontairement : plusieurs couches
en production sont déjà stylées avec l'ancienne (`ST_ClusterKMeans`), et la
remplacer purement et simplement aurait changé leurs bornes de classes sans que
l'administrateur ne l'ait demandé. Le choix entre les deux se fait uniquement
côté frontend, dans le sélecteur de méthode de `GraduateValue.js`.

Le nombre de classes est plafonné à `MAX_CLASSES = 100`
(`project/geo_api/views/discretize.py`), pour éviter qu'une requête ne
retourne un tableau `entitiesByClass` disproportionné.

### Mode manuel

En mode `manual`, les bornes sont transmises via le paramètre `breaks`
(liste de valeurs séparées par des virgules). Le backend valide qu'elles sont
strictement croissantes et qu'il y en a au moins deux :

```
GET geo-api/{layer}/feature/discretize/{field}/?method=manual&breaks=10,20,50,100
```

`ManualBreaks.js` gère l'édition inline de ces bornes : chaque valeur
intermédiaire est un champ numérique éditable, avec un arrondi (`roundTo`) et
un mécanisme de verrouillage (`CLAMP_MARGIN = 0.01`) qui empêche une borne de
dépasser ses voisines directes lors de la saisie ou du clic sur les flèches
haut/bas.

## Palettes

`DicopalField.js` et `PaletteSelect.js` s'appuient sur la bibliothèque
`dicopal` (ColorBrewer, CARTOColors, Scientific Colour Maps, cmocean, palettes
Color Universal Design), qui regroupe plusieurs familles de palettes conçues
pour rester lisibles, y compris en cas de daltonisme.

Trois modes sont proposés : séquentiel, divergent, personnalisé. Le mode
divergent répartit les couleurs de part et d'autre d'une valeur centrale via
`getAsymmetricDivergingColors`, le mode séquentiel interpole une seule
progression via `getSequentialColors`. Quand le nombre de classes change, la
palette sélectionnée est automatiquement réinterpolée plutôt que de nécessiter
une nouvelle sélection manuelle. Un bouton permet également d'inverser l'ordre
des couleurs, et le tableau de couleurs résultant peut être copié ou collé au
format JSON (`['#rrggbb', ...]`) pour être réutilisé ailleurs.

## Fichiers concernés

| Fichier | Rôle |
|---|---|
| [`GraduateValue.js`](./GraduateValue.js) | Orchestrateur : méthode, nombre de classes, palette, assemblage des trois panneaux |
| [`StatsPreview.js`](./StatsPreview.js) | Tableau de statistiques descriptives |
| [`DistribPreview.js`](./DistribPreview.js) / [`DistribGraph.js`](./DistribGraph.js) | Récupération et rendu de la distribution (histogramme, boxplot, échantillon) |
| [`DiscretPreview.js`](./DiscretPreview.js) | Récupération et rendu de la discrétisation choisie |
| [`ClassifGraph.js`](./ClassifGraph.js) | Histogramme des classes avec repères statistiques |
| [`ClassifBornes.js`](./ClassifBornes.js) | Liste textuelle des bornes de classes |
| [`ClassifBucket.js`](./ClassifBucket.js) | Bande de couleur proportionnelle aux effectifs |
| [`ManualBreaks.js`](./ManualBreaks.js) | Édition inline des bornes en mode manuel |
| [`DicopalField.js`](./DicopalField.js) / [`PaletteSelect.js`](./PaletteSelect.js) | Sélection et interpolation de palette |
| [`project/geo_api/views/stats.py`](../../../../../../../../../project/geo_api/views/stats.py) | Endpoints `stats/` et `stats/.../distribution/` |
| [`project/geo_api/views/discretize.py`](../../../../../../../../../project/geo_api/views/discretize.py) | Endpoint `discretize/`, dispatch des méthodes, validation du mode manuel |
| [`project/terra_layer/style/utils.py`](../../../../../../../../../project/terra_layer/style/utils.py) | Implémentations SQL de `jenks`, `quantile`, `equal_interval` |
| [`project/terra_layer/style/classifiers.py`](../../../../../../../../../project/terra_layer/style/classifiers.py) | Implémentation `jenks_kmeans1d` |
| [`project/geo_api/filters.py`](../../../../../../../../../project/geo_api/filters.py) | `cast_numeric`, casting sûr des propriétés JSON |

## Limites connues

- La coexistence des deux implémentations de Jenks n'est pas tranchée : à
  terme, il faudra soit assumer les deux méthodes dans l'interface au risque de
  dérouter l'administrateur sur le choix à faire, soit migrer progressivement
  les couches existantes vers la nouvelle implémentation.
- Aucun `statement_timeout` PostgreSQL ne protège actuellement les requêtes de
  discrétisation ou de distribution sur les couches les plus volumineuses.
- Le plafond `MAX_CLASSES = 100` est un garde-fou arbitraire plutôt qu'une
  valeur mesurée ; il n'a pas été confronté à un cas d'usage réel nécessitant
  plus de classes.
