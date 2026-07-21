import React from 'react';
import { useField } from 'react-final-form';
import { SelectInput, LinearProgress } from 'react-admin';
import { useTranslation } from 'react-i18next';
import Api from '@terralego/core/modules/Api';

const GpkgLayerNameSelect = () => {
  const [layerNames, setLayerNames] = React.useState([]);
  const [loading, setLoading] = React.useState(false);
  const { input: { value: fileValue } } = useField('file');
  const { input: { onChange: setLayerName } } = useField('layer_name');
  const { t } = useTranslation();

  React.useEffect(() => {
    if (!fileValue?.rawFile) {
      setLayerNames([]);
      return undefined;
    }

    let cancelled = false;
    setLoading(true);

    const body = new FormData();
    body.append('file', fileValue.rawFile);

    Api.request('geosource/gpkg-layers/', { method: 'POST', body })
      .then(({ layer_names = [] }) => {
        if (cancelled) return;
        setLayerNames(layer_names);
        if (layer_names.length > 0) setLayerName(layer_names[0]);
      })
      .catch(() => { if (!cancelled) setLayerNames([]); })
      .finally(() => { if (!cancelled) setLoading(false); });

    return () => { cancelled = true; };
  }, [fileValue]);

  if (loading) return <LinearProgress />;
  if (layerNames.length === 0) return null;

  return (
    <SelectInput
      source="layer_name"
      label={t('datasource.form.layer-name')}
      choices={layerNames.map(name => ({ id: name, name }))}
      helperText={t('datasource.form.layer-name-help')}
    />
  );
};

export default GpkgLayerNameSelect;
