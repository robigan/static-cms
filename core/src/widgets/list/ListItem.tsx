import { styled } from '@mui/material/styles';
import partial from 'lodash/partial';
import React, { useCallback, useMemo, useState } from 'react';
import { SortableElement, SortableHandle } from 'react-sortable-hoc';

import EditorControl from '../../components/Editor/EditorControlPane/EditorControl';
import ListItemTopBar from '../../components/UI/ListItemTopBar';
import Outline from '../../components/UI/Outline';
import { colors } from '../../components/UI/styles';
import { transientOptions } from '../../lib';
import { addFileTemplateFields, compileStringTemplate } from '../../lib/widgets/stringTemplate';
import { ListValueType } from './ListControl';
import { getTypedFieldForValue } from './typedListHelpers';

import type { MouseEvent } from 'react';
import type {
  Entry,
  EntryData,
  ListField,
  NumberField,
  ObjectField,
  ObjectValue,
  StringOrTextField,
  WidgetControlProps,
} from '../../interface';

export class ListValueTypeError extends Error {
  constructor(type: ListValueType) {
      super(`A ListValueType was used in a place where ListValueType isn't supported, tried using ${type}`);
  }
}

const StyledListItem = styled('div')`
  position: relative;
`;

const SortableStyledListItem = SortableElement<{ children: JSX.Element }>(StyledListItem);

const StyledListItemTopBar = styled(ListItemTopBar)`
  background-color: ${colors.textFieldBorder};
`;

interface StyledObjectFieldWrapperProps {
  $collapsed: boolean;
}

const StyledObjectFieldWrapper = styled(
  'div',
  transientOptions,
)<StyledObjectFieldWrapperProps>(
  ({ $collapsed }) => `
    display: flex;
    flex-direction: column;
    gap: 16px;
    ${
      $collapsed
        ? `
          display: none;
        `
        : ''
    }
  `,
);

function handleSummary(summary: string, entry: Entry, label: string, item: ObjectValue) {
  const labeledItem: EntryData = {
    ...item,
    fields: {
      label,
    },
  };
  const data = addFileTemplateFields(entry.path, labeledItem);
  return compileStringTemplate(summary, null, '', data);
}

function validateItem(field: ListField, item: ObjectValue) {
  if (!(typeof item === 'object')) {
    console.warn(
      `'${field.name}' field item value value should be an object but is a '${typeof item}'`,
    );
    return false;
  }

  return true;
}

interface ListItemProps
  extends Pick<
    WidgetControlProps<ObjectValue, ListField>,
    | 'entry'
    | 'field'
    | 'fieldsErrors'
    | 'submitted'
    | 'isFieldDuplicate'
    | 'isFieldHidden'
    | 'locale'
    | 'path'
    | 'value'
    | 'i18n'
  > {
  valueType: ListValueType;
  index: number;
  handleRemove: (index: number, event: MouseEvent) => void;
}

const ListItem = ({
  index,
  entry,
  field,
  fieldsErrors,
  submitted,
  isFieldDuplicate,
  isFieldHidden,
  locale,
  path,
  valueType,
  handleRemove,
  value,
  i18n,
}: ListItemProps) => {
  const [computedLabel, computedField, computedValue] = useMemo((): [string, ListField | ObjectField | StringOrTextField | NumberField, typeof value | string | number] => {
    const childObjectField: ObjectField = {
      name: `${index}`,
      label: field.label,
      summary: field.summary,
      widget: 'object',
      fields: [],
    };

    const base = field.label ?? field.name;
    if (valueType === null) {
      return [base, childObjectField, value];
    }

    const objectValue = value ?? {};

    switch (valueType) {
      case ListValueType.MIXED: {
        if (!validateItem(field, objectValue)) {
          return [base, childObjectField, value];
        }

        const itemType = getTypedFieldForValue(field, objectValue, index);
        if (!itemType) {
          return [base, childObjectField, value];
        }

        const label = itemType.label ?? itemType.name;
        // each type can have its own summary, but default to the list summary if exists
        const summary = ('summary' in itemType && itemType.summary) ?? field.summary;
        const labelReturn = summary
          ? `${label} - ${handleSummary(summary, entry, label, objectValue)}`
          : label;
        return [labelReturn, itemType, value];
      }
      case ListValueType.MULTIPLE: {
        childObjectField.fields = field.fields ?? [];

        if (!validateItem(field, objectValue)) {
          return [base, childObjectField, value];
        }

        const multiFields = field.fields;
        const labelField = multiFields && multiFields[0];
        if (!labelField) {
          return [base, childObjectField, value];
        }

        const labelFieldValue = objectValue[labelField.name];

        const summary = field.summary;
        const labelReturn = summary
          ? handleSummary(summary, entry, String(labelFieldValue), objectValue)
          : labelFieldValue;
        return [(labelReturn || `No ${labelField.name}`).toString(), childObjectField, value];
      }
      case ListValueType.SINGLE: {
        const widgetField = field.field;

        if (typeof(widgetField) === "undefined") throw new ListValueTypeError(ListValueType.SINGLE);
        if (widgetField.widget !== "number" && widgetField.widget !== "string") {
          console.warn("Treating a list widget's `field` property as a `fields` property. Unintended side affects may present themselves");
          return [base, childObjectField, value];
        }
        if (!validateItem(field, objectValue)) {
          return [base, childObjectField, value];
        }

        let originalFieldValue = objectValue[widgetField.name];

        if (typeof originalFieldValue !== "number" && typeof originalFieldValue !== "string") {
          if (widgetField.widget === "number") originalFieldValue = 0;
          else if (widgetField.widget === "string") originalFieldValue = "";
        }

        const fieldValue = originalFieldValue as string | number;

        const label = widgetField.label ?? widgetField.name;
        const labelReturn = fieldValue ? fieldValue.toString() : label;
        
        return [labelReturn, widgetField, fieldValue];
      }
    }
  }, [entry, field, index, value, valueType]);

  const [collapsed, setCollapsed] = useState(false);
  const handleCollapseToggle = useCallback(
    (event: MouseEvent) => {
      event.stopPropagation();
      setCollapsed(!collapsed);
    },
    [collapsed],
  );

  const isDuplicate = isFieldDuplicate && isFieldDuplicate(field);
  const isHidden = isFieldHidden && isFieldHidden(field);

  return (
    <SortableStyledListItem key="sortable-list-item" index={index}>
      <>
        <StyledListItemTopBar
          key="list-item-top-bar"
          collapsed={collapsed}
          onCollapseToggle={handleCollapseToggle}
          onRemove={partial(handleRemove, index)}
          dragHandleHOC={SortableHandle}
          data-testid={`styled-list-item-top-bar-${index}`}
          title={computedLabel}
          isVariableTypesList={valueType === ListValueType.MIXED}
        />
        <StyledObjectFieldWrapper $collapsed={collapsed}>
          <EditorControl
            key={index}
            field={computedField}
            value={computedValue}
            fieldsErrors={fieldsErrors}
            submitted={submitted}
            parentPath={path}
            isDisabled={isDuplicate}
            isHidden={isHidden}
            isFieldDuplicate={isFieldDuplicate}
            isFieldHidden={isFieldHidden}
            locale={locale}
            i18n={i18n}
            forList
          />
        </StyledObjectFieldWrapper>
        <Outline key="outline" />
      </>
    </SortableStyledListItem>
  );
};

export default ListItem;
