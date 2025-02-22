import deepmerge from 'deepmerge';
import { produce } from 'immer';
import trim from 'lodash/trim';
import trimStart from 'lodash/trimStart';
import yaml from 'yaml';

import { resolveBackend } from '../backend';
import validateConfig from '../constants/configSchema';
import { I18N, I18N_FIELD, I18N_STRUCTURE } from '../lib/i18n';
import { selectDefaultSortableFields } from '../lib/util/collection.util';
import { getIntegrations, selectIntegration } from '../reducers/integrations';

import type { AnyAction } from 'redux';
import type { ThunkDispatch } from 'redux-thunk';
import type {
  BaseField,
  Collection,
  Config,
  Field,
  I18nInfo,
  ListField,
  LocalBackend,
  ObjectField,
  UnknownField,
} from '../interface';
import type { RootState } from '../store';

export const CONFIG_REQUEST = 'CONFIG_REQUEST';
export const CONFIG_SUCCESS = 'CONFIG_SUCCESS';
export const CONFIG_FAILURE = 'CONFIG_FAILURE';

function isObjectField<F extends BaseField = UnknownField>(field: Field<F>): field is ObjectField {
  return 'fields' in (field as ObjectField);
}

function isFieldList<F extends BaseField = UnknownField>(field: Field<F>): field is ListField {
  return 'types' in (field as ListField) || 'field' in (field as ListField);
}

function traverseFieldsJS<F extends Field>(
  fields: F[],
  updater: <T extends Field>(field: T) => T,
): F[] {
  return fields.map(field => {
    const newField = updater(field);
    if (isObjectField(newField)) {
      return { ...newField, fields: traverseFieldsJS(newField.fields, updater) };
    } else if (isFieldList(newField) && newField.types) {
      return { ...newField, types: traverseFieldsJS(newField.types, updater) };
    }

    return newField;
  });
}

function getConfigUrl() {
  const validTypes: { [type: string]: string } = {
    'text/yaml': 'yaml',
    'application/x-yaml': 'yaml',
  };
  const configLinkEl = document.querySelector<HTMLLinkElement>('link[rel="cms-config-url"]');
  if (configLinkEl && validTypes[configLinkEl.type] && configLinkEl.href) {
    console.info(`Using config file path: "${configLinkEl.href}"`);
    return configLinkEl.href;
  }
  return 'config.yml';
}

function setDefaultPublicFolderForField<T extends Field>(field: T) {
  if ('media_folder' in field && !('public_folder' in field)) {
    return { ...field, public_folder: field.media_folder };
  }
  return field;
}

function setI18nField<T extends Field>(field: T) {
  if (field[I18N] === true) {
    return { ...field, [I18N]: I18N_FIELD.TRANSLATE };
  } else if (field[I18N] === false || !field[I18N]) {
    return { ...field, [I18N]: I18N_FIELD.NONE };
  }
  return field;
}

function getI18nDefaults(collectionOrFileI18n: boolean | I18nInfo, defaultI18n: I18nInfo) {
  if (typeof collectionOrFileI18n === 'boolean') {
    return defaultI18n;
  } else {
    const locales = collectionOrFileI18n.locales || defaultI18n.locales;
    const defaultLocale = collectionOrFileI18n.defaultLocale || locales[0];
    const mergedI18n: I18nInfo = deepmerge(defaultI18n, collectionOrFileI18n);
    mergedI18n.locales = locales;
    mergedI18n.defaultLocale = defaultLocale;
    throwOnMissingDefaultLocale(mergedI18n);
    return mergedI18n;
  }
}

function setI18nDefaultsForFields(collectionOrFileFields: Field[], hasI18n: boolean) {
  if (hasI18n) {
    return traverseFieldsJS(collectionOrFileFields, setI18nField);
  } else {
    return traverseFieldsJS(collectionOrFileFields, field => {
      const newField = { ...field };
      delete newField[I18N];
      return newField;
    });
  }
}

function throwOnInvalidFileCollectionStructure(i18n?: I18nInfo) {
  if (i18n && i18n.structure !== I18N_STRUCTURE.SINGLE_FILE) {
    throw new Error(
      `i18n configuration for files collections is limited to ${I18N_STRUCTURE.SINGLE_FILE} structure`,
    );
  }
}

function throwOnMissingDefaultLocale(i18n?: I18nInfo) {
  if (i18n && i18n.defaultLocale && !i18n.locales.includes(i18n.defaultLocale)) {
    throw new Error(
      `i18n locales '${i18n.locales.join(', ')}' are missing the default locale ${
        i18n.defaultLocale
      }`,
    );
  }
}

function hasIntegration(config: Config, collection: Collection) {
  const integrations = getIntegrations(config);
  const integration = selectIntegration(integrations, collection.name, 'listEntries');
  return !!integration;
}

export function applyDefaults(originalConfig: Config) {
  return produce(originalConfig, config => {
    config.slug = config.slug || {};
    config.collections = config.collections || [];

    // Use `site_url` as default `display_url`.
    if (!config.display_url && config.site_url) {
      config.display_url = config.site_url;
    }

    // Use media_folder as default public_folder.
    const defaultPublicFolder = `/${trimStart(config.media_folder, '/')}`;
    if (!('public_folder' in config)) {
      config.public_folder = defaultPublicFolder;
    }

    // default values for the slug config
    if (!('encoding' in config.slug)) {
      config.slug.encoding = 'unicode';
    }

    if (!('clean_accents' in config.slug)) {
      config.slug.clean_accents = false;
    }

    if (!('sanitize_replacement' in config.slug)) {
      config.slug.sanitize_replacement = '-';
    }

    const i18n = config[I18N];

    if (i18n) {
      i18n.defaultLocale = i18n.defaultLocale || i18n.locales[0];
    }

    throwOnMissingDefaultLocale(i18n);

    const backend = resolveBackend(config);

    for (const collection of config.collections) {
      let collectionI18n = collection[I18N];

      if (config.editor && !collection.editor) {
        collection.editor = { preview: config.editor.preview, frame: config.editor.frame };
      }

      if (i18n && collectionI18n) {
        collectionI18n = getI18nDefaults(collectionI18n, i18n);
        collection[I18N] = collectionI18n;
      } else {
        collectionI18n = undefined;
        delete collection[I18N];
      }

      if ('fields' in collection && collection.fields) {
        collection.fields = setI18nDefaultsForFields(collection.fields, Boolean(collectionI18n));
      }

      const { view_filters, view_groups } = collection;

      if ('folder' in collection && collection.folder) {
        if (collection.path && !collection.media_folder) {
          // default value for media folder when using the path config
          collection.media_folder = '';
        }

        if ('media_folder' in collection && !('public_folder' in collection)) {
          collection.public_folder = collection.media_folder;
        }

        if ('fields' in collection && collection.fields) {
          collection.fields = traverseFieldsJS(collection.fields, setDefaultPublicFolderForField);
        }

        collection.folder = trim(collection.folder, '/');
      }

      if ('files' in collection && collection.files) {
        throwOnInvalidFileCollectionStructure(collectionI18n);

        for (const file of collection.files) {
          file.file = trimStart(file.file, '/');

          if ('media_folder' in file && !('public_folder' in file)) {
            file.public_folder = file.media_folder;
          }

          if (file.fields) {
            file.fields = traverseFieldsJS(file.fields, setDefaultPublicFolderForField);
          }

          let fileI18n = file[I18N];

          if (fileI18n && collectionI18n) {
            fileI18n = getI18nDefaults(fileI18n, collectionI18n);
            file[I18N] = fileI18n;
          } else {
            fileI18n = undefined;
            delete file[I18N];
          }

          throwOnInvalidFileCollectionStructure(fileI18n);

          if (file.fields) {
            file.fields = setI18nDefaultsForFields(file.fields, Boolean(fileI18n));
          }

          if (collection.editor && !file.editor) {
            file.editor = { preview: collection.editor.preview, frame: collection.editor.frame };
          }
        }
      }

      if (!collection.sortable_fields) {
        collection.sortable_fields = {
          fields: selectDefaultSortableFields(
            collection,
            backend,
            hasIntegration(config, collection),
          ),
        };
      }

      collection.view_filters = (view_filters || []).map(filter => {
        return {
          ...filter,
          id: `${filter.field}__${filter.pattern}`,
        };
      });

      collection.view_groups = (view_groups || []).map(group => {
        return {
          ...group,
          id: `${group.field}__${group.pattern}`,
        };
      });
    }
  });
}

export function parseConfig(data: string) {
  const config = yaml.parse(data, { maxAliasCount: -1, prettyErrors: true, merge: true });
  if (
    typeof window !== 'undefined' &&
    typeof window.CMS_ENV === 'string' &&
    config[window.CMS_ENV]
  ) {
    const configKeys = Object.keys(config[window.CMS_ENV]) as ReadonlyArray<keyof Config>;
    for (const key of configKeys) {
      config[key] = config[window.CMS_ENV][key] as Config[keyof Config];
    }
  }
  return config as Config;
}

async function getConfigYaml(file: string): Promise<Config> {
  const response = await fetch(file, { credentials: 'same-origin' }).catch(error => error as Error);
  if (response instanceof Error || response.status !== 200) {
    const message = response instanceof Error ? response.message : response.status;
    throw new Error(`Failed to load config.yml (${message})`);
  }
  const contentType = response.headers.get('Content-Type') ?? 'Not-Found';
  const isYaml = contentType.indexOf('yaml') !== -1;
  if (!isYaml) {
    console.info(`Response for ${file} was not yaml. (Content-Type: ${contentType})`);
  }
  return parseConfig(await response.text());
}

export function configLoaded(config: Config) {
  return {
    type: CONFIG_SUCCESS,
    payload: config,
  } as const;
}

export function configLoading() {
  return {
    type: CONFIG_REQUEST,
  } as const;
}

export function configFailed(err: Error) {
  return {
    type: CONFIG_FAILURE,
    error: 'Error loading config',
    payload: err,
  } as const;
}

export async function detectProxyServer(localBackend?: boolean | LocalBackend) {
  const allowedHosts = [
    'localhost',
    '127.0.0.1',
    ...(typeof localBackend === 'boolean' ? [] : localBackend?.allowed_hosts || []),
  ];

  if (!allowedHosts.includes(location.hostname) || !localBackend) {
    return {};
  }

  const defaultUrl = 'http://localhost:8081/api/v1';
  const proxyUrl =
    localBackend === true
      ? defaultUrl
      : localBackend.url || defaultUrl.replace('localhost', location.hostname);

  try {
    console.info(`Looking for Static CMS Proxy Server at '${proxyUrl}'`);
    const res = await fetch(`${proxyUrl}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'info' }),
    });
    const { repo, type } = (await res.json()) as {
      repo?: string;
      type?: string;
    };
    if (typeof repo === 'string' && typeof type === 'string') {
      console.info(`Detected Static CMS Proxy Server at '${proxyUrl}' with repo: '${repo}'`);
      return { proxyUrl, type };
    } else {
      console.info(`Static CMS Proxy Server not detected at '${proxyUrl}'`);
      return {};
    }
  } catch {
    console.info(`Static CMS Proxy Server not detected at '${proxyUrl}'`);
    return {};
  }
}

export async function handleLocalBackend(originalConfig: Config) {
  if (!originalConfig.local_backend) {
    return originalConfig;
  }

  const { proxyUrl } = await detectProxyServer(originalConfig.local_backend);

  if (!proxyUrl) {
    return originalConfig;
  }

  return produce(originalConfig, config => {
    config.backend.name = 'proxy';
    config.backend.proxy_url = proxyUrl;
  });
}

export function loadConfig(manualConfig: Config | undefined, onLoad: (config: Config) => unknown) {
  if (window.CMS_CONFIG) {
    return configLoaded(window.CMS_CONFIG);
  }
  return async (dispatch: ThunkDispatch<RootState, {}, AnyAction>) => {
    dispatch(configLoading());

    try {
      const configUrl = getConfigUrl();
      const mergedConfig = manualConfig ? manualConfig : await getConfigYaml(configUrl);

      validateConfig(mergedConfig);

      const withLocalBackend = await handleLocalBackend(mergedConfig);
      const config = applyDefaults(withLocalBackend);

      dispatch(configLoaded(config));

      if (typeof onLoad === 'function') {
        onLoad(config);
      }
    } catch (error: unknown) {
      console.error(error);
      if (error instanceof Error) {
        dispatch(configFailed(error));
      }
      throw error;
    }
  };
}

export type ConfigAction = ReturnType<
  typeof configLoading | typeof configLoaded | typeof configFailed
>;
