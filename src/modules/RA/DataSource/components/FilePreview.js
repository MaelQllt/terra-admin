import React from 'react';
import { useField } from 'react-final-form';
import { useRecordContext } from 'react-admin';
import { useTranslation } from 'react-i18next';
import { makeStyles, useTheme } from '@material-ui/core/styles';
import {
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Divider,
  LinearProgress,
  TableContainer,
  Typography,
} from '@material-ui/core';
import ExpandMoreIcon from '@material-ui/icons/ExpandMore';
import MapIcon from '@material-ui/icons/Map';
import { Alert, Skeleton } from '@material-ui/lab';
import mapboxgl from 'mapbox-gl';
import Api from '@terralego/core/modules/Api';
import 'mapbox-gl/dist/mapbox-gl.css';

const useStyles = makeStyles(theme => ({
  meta: {
    display: 'flex',
    gap: theme.spacing(2),
    flexWrap: 'wrap',
    marginBottom: theme.spacing(1),
  },
  metaItem: {
    color: theme.palette.text.secondary,
    whiteSpace: 'nowrap',
    '& strong': {
      color: theme.palette.text.primary,
    },
  },
  previewBody: {
    height: 469,
    overflow: 'auto',
  },
  oldContent: {
    opacity: 0.4,
    pointerEvents: 'none',
  },
  mapPlaceholder: {
    height: 220,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.spacing(1),
    marginTop: theme.spacing(1),
    borderRadius: 4,
    border: `1px dashed ${theme.palette.divider}`,
    color: theme.palette.text.secondary,
  },
  table: {
    minWidth: 650,
    borderCollapse: 'collapse',
    '& th, & td': {
      padding: theme.spacing(0.5, 1),
      borderBottom: `1px solid ${theme.palette.divider}`,
      textAlign: 'left',
      whiteSpace: 'nowrap',
      fontSize: '0.8125rem',
    },
    '& th': {
      fontWeight: 600,
      color: theme.palette.text.secondary,
    },
    '& tr:last-child td': {
      borderBottom: 'none',
    },
  },
  moreRow: {
    color: theme.palette.text.secondary,
    fontStyle: 'italic',
  },
  nullValue: {
    fontStyle: 'italic',
    fontWeight: 400,
    color: theme.palette.text.secondary,
  },
}));

const formatSize = bytes => {
  if (bytes == null) return '';
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} Ko`;
  return `${(bytes / 1048576).toFixed(1)} Mo`;
};

const MAX_DISPLAY = 5;

const BBoxMap = ({ bbox }) => {
  const mapContainer = React.useRef(null);
  const mapRef = React.useRef(null);
  const { palette } = useTheme();

  React.useEffect(() => {
    if (!mapContainer.current || !bbox || bbox.length !== 4) return () => {};

    const [minX, minY, maxX, maxY] = bbox;

    mapboxgl.accessToken = 'pk.placeholder';
    const map = new mapboxgl.Map({
      container: mapContainer.current,
      style: 'https://tiles.openfreemap.org/styles/liberty',
      bounds: [[minX, minY], [maxX, maxY]],
      fitBoundsOptions: { padding: 20 },
    });
    mapRef.current = map;

    map.addControl(new mapboxgl.NavigationControl(), 'top-right');

    map.on('load', () => {
      if (!mapRef.current || mapRef.current.bboxAdded) return;
      mapRef.current.bboxAdded = true;
      try {
        map.addSource('bbox-src', {
          type: 'geojson',
          data: {
            type: 'Feature',
            properties: {},
            geometry: {
              type: 'Polygon',
              coordinates: [[
                [minX, minY],
                [maxX, minY],
                [maxX, maxY],
                [minX, maxY],
                [minX, minY],
              ]],
            },
          },
        });
        map.addLayer({
          id: 'bbox-fill',
          type: 'fill',
          source: 'bbox-src',
          paint: { 'fill-color': palette.primary.main, 'fill-opacity': 0.2 },
        });
        map.addLayer({
          id: 'bbox-outline',
          type: 'line',
          source: 'bbox-src',
          paint: { 'line-color': palette.primary.main, 'line-width': 2 },
        });
      } catch (e) {
        // eslint-disable-next-line no-console
        console.error('BBoxMap: failed to add layer', e);
      }
    });

    return () => { map.remove(); mapRef.current = null; };
  }, [bbox, palette]);
  const classes = useStyles();
  const { t } = useTranslation();
  if (!bbox) {
    return (
      <div className={classes.mapPlaceholder}>
        <MapIcon />
        <Typography variant="body2">
          {t('datasource.form.preview.no-geodata')}
        </Typography>
      </div>
    );
  }

  return (
    <div
      ref={mapContainer}
      style={{ height: 220, width: '100%', borderRadius: 4, marginTop: 8 }}
    />
  );
};

const FilePreview = () => {
  const classes = useStyles();
  const record = useRecordContext();
  const { input: { value: fileValue } } = useField('file');
  const { input: { value: layerName } } = useField('layer_name');
  const { input: { value: fieldSeparator } } = useField('field_separator', { defaultValue: 'semicolon' });
  const { input: { value: charDelimiter } } = useField('char_delimiter', { defaultValue: 'doublequote' });
  const { input: { value: decimalSeparator } } = useField('decimal_separator', { defaultValue: 'point' });
  const { input: { value: encoding } } = useField('encoding', { defaultValue: 'UTF-8' });
  const { input: { value: linesToIgnore } } = useField('number_lines_to_ignore', { defaultValue: 0 });
  const { input: { value: useHeader } } = useField('use_header', { defaultValue: true });
  const { input: { value: coordinatesField } } = useField('coordinates_field');
  const { input: { value: latitudeField } } = useField('latitude_field');
  const { input: { value: longitudeField } } = useField('longitude_field');
  const { input: { value: latlongField } } = useField('latlong_field');
  const { input: { value: coordinatesFieldCount } } = useField('coordinates_field_count');
  const { input: { value: coordinatesSeparator } } = useField('coordinates_separator');
  const { input: { value: coordinateReferenceSystem } } = useField('coordinate_reference_system');
  const { input: { value: geomTypeValue, onChange: onGeomTypeChange } } = useField('geom_type');
  const { t } = useTranslation();

  const [preview, setPreview] = React.useState(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState(null);
  const savedBboxRef = React.useRef(null);

  const isEditMode = record?.id && !fileValue?.rawFile;

  React.useEffect(() => {
    let cancelled = false;
    let timer;
    setLoading(true);
    setError(null);

    const runPreview = () => {
      if (isEditMode) {
        Api.request(`geosource/${record.id}/file-preview/`)
          .then(resp => {
            if (!cancelled) setPreview(resp);
          })
          .catch(err => { if (!cancelled) setError(err?.message || String(err)); })
          .finally(() => { if (!cancelled) setLoading(false); });
        return;
      }

      if (!fileValue?.rawFile) {
        setPreview(null);
        setLoading(false);
        return;
      }

      const isGpkg = fileValue.rawFile.name?.toLowerCase().endsWith('.gpkg');
      if (isGpkg && !layerName) {
        setPreview(null);
        setError(null);
        setLoading(false);
        return;
      }

      const body = new FormData();
      body.append('file', fileValue.rawFile);
      if (layerName) {
        body.append('layer_name', layerName);
      }
      body.append('field_separator', fieldSeparator);
      body.append('char_delimiter', charDelimiter);
      body.append('decimal_separator', decimalSeparator);
      body.append('encoding', encoding);
      body.append('number_lines_to_ignore', linesToIgnore);
      body.append('use_header', useHeader);
      if (coordinatesField) body.append('coordinates_field', coordinatesField);
      if (latitudeField) body.append('latitude_field', latitudeField);
      if (longitudeField) body.append('longitude_field', longitudeField);
      if (latlongField) body.append('latlong_field', latlongField);
      if (coordinatesFieldCount) body.append('coordinates_field_count', coordinatesFieldCount);
      if (coordinatesSeparator) body.append('coordinates_separator', coordinatesSeparator);
      if (coordinateReferenceSystem) body.append('coordinate_reference_system', coordinateReferenceSystem);
      Api.request('geosource/file-preview/', { method: 'POST', body })
        .then(resp => {
          if (!cancelled) {
            if (resp.bbox) savedBboxRef.current = resp.bbox;
            if (resp.geometry_type != null && !geomTypeValue) onGeomTypeChange(resp.geometry_type);
            setPreview(resp);
          }
        })
        .catch(err => { if (!cancelled) setError(err?.message || String(err)); })
        .finally(() => { if (!cancelled) setLoading(false); });
    };

    if (fileValue?.rawFile) {
      timer = setTimeout(runPreview, 350);
    } else {
      runPreview();
    }

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    fileValue, isEditMode, record?.id, layerName,
    fieldSeparator, charDelimiter, decimalSeparator,
    encoding, linesToIgnore, useHeader,
    coordinatesField, latitudeField, longitudeField,
    latlongField, coordinatesFieldCount,
    coordinatesSeparator, coordinateReferenceSystem,
  ]);

  if (!isEditMode && !fileValue?.rawFile) return null;

  const {
    record_count: recordCount,
    geometry_type_name: geomName,
    geometry_types: geomTypes,
    mixed_geometries: mixedGeometries,
    crs, fields, features,
    file_size: fileSize,
    bbox: bboxData,
    column_count: columnCount,
  } = preview ?? {};

  const effectiveBbox = bboxData ?? savedBboxRef.current;
  const hasMore = recordCount > MAX_DISPLAY;
  const hasGeom = !!geomName || !!geomTypes?.length;
  const geomLabel = mixedGeometries ? geomTypes?.join(', ') : geomName;
  const fileSizeLabel = formatSize(fileValue?.rawFile?.size ?? fileSize);
  const isGpkgFile = fileValue?.rawFile?.name?.toLowerCase().endsWith('.gpkg');

  return (
    <Accordion defaultExpanded style={{ marginTop: 8, marginBottom: 8 }}>
      <AccordionSummary expandIcon={<ExpandMoreIcon />}>
        <Typography style={{ fontWeight: 'bold' }}>
          {t('datasource.form.preview.title')}
          {fileSizeLabel && ` (${fileSizeLabel})`}
        </Typography>
      </AccordionSummary>
      <AccordionDetails style={{ flexDirection: 'column', padding: '0 16px 12px' }}>
        <div className={classes.previewBody}>
          {loading && preview && <LinearProgress style={{ marginBottom: 8 }} />}
          {error ? (
            <Typography color="error" style={{ padding: 8 }}>{error}</Typography>
          ) : (
            <div className={loading && preview ? classes.oldContent : undefined}>
              {loading && !preview ? (
                <>
                  <Skeleton variant="rect" width="70%" height={20} style={{ marginBottom: 8 }} />
                  <Skeleton variant="rect" height={180} style={{ marginBottom: 8 }} />
                  <Skeleton variant="rect" height={220} style={{ marginTop: 8, borderRadius: 4 }} />
                </>
              ) : (
                <>
                  {preview && (
                    <>
                      <div className={classes.meta}>
                        <Typography variant="body2" className={classes.metaItem}>
                          {t('datasource.form.preview.row-count')}{' '}
                          <strong>{recordCount.toLocaleString()}</strong>
                        </Typography>
                        {columnCount > 0 && (
                        <Typography variant="body2" className={classes.metaItem}>
                          {t('datasource.form.preview.column-count')}{' '}
                          <strong>{columnCount}</strong>
                        </Typography>
                        )}
                        {hasGeom && (
                        <Typography variant="body2" className={classes.metaItem}>
                          {t('datasource.form.preview.geom-type')}{' '}
                          <strong>{geomLabel}</strong>
                        </Typography>
                        )}
                        {crs && (
                        <Typography variant="body2" className={classes.metaItem}>
                          {t('datasource.form.preview.crs')}{' '}
                          <strong>{crs}</strong>
                        </Typography>
                        )}
                      </div>

                      {mixedGeometries && (
                      <Alert severity="warning" style={{ marginBottom: 8 }}>
                        {t('datasource.form.preview.mixed-geometries-warning')}
                      </Alert>
                      )}

                      <Divider style={{ marginBottom: 8 }} />

                      {(fields ?? []).length > 0 && (
                      <TableContainer>
                        <table className={classes.table}>
                          <thead>
                            <tr>
                              {fields.map(field => (
                                <th
                                  key={field.name}
                                  style={field.type === 'int' || field.type === 'float' ? { textAlign: 'right' } : undefined}
                                >
                                  {field.name} ({field.type})
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {features.map((row, i) => (
                              // eslint-disable-next-line react/no-array-index-key
                              <tr key={i}>
                                {fields.map(field => (
                                  <td
                                    key={field.name}
                                    style={field.type === 'int' || field.type === 'float' ? { textAlign: 'right' } : undefined}
                                  >
                                    {row[field.name] != null
                                      ? String(row[field.name])
                                      : <span className={classes.nullValue}>null</span>}
                                  </td>
                                ))}
                              </tr>
                            ))}
                            {hasMore && (
                            <tr>
                              <td
                                colSpan={fields.length}
                                className={classes.moreRow}
                              >
                                + {recordCount - MAX_DISPLAY}{' '}
                                {t('datasource.form.preview.rows')}
                              </td>
                            </tr>
                            )}
                          </tbody>
                        </table>
                      </TableContainer>
                      )}

                      <BBoxMap bbox={effectiveBbox} />
                    </>
                  )}
                  {!preview && !loading && !error && isGpkgFile && !layerName && (
                  <Typography variant="body2" className={classes.metaItem}>
                    {t('datasource.form.preview.no-layer')}
                  </Typography>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      </AccordionDetails>
    </Accordion>
  );
};

export default FilePreview;
