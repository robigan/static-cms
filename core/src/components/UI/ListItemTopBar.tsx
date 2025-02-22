import { styled } from '@mui/material/styles';
import CloseIcon from '@mui/icons-material/Close';
import DragHandleIcon from '@mui/icons-material/DragHandle';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import IconButton from '@mui/material/IconButton';
import React from 'react';

import { transientOptions } from '@staticcms/core/lib/util';
import { buttons, colors, lengths, transitions } from './styles';

import type { ComponentClass, MouseEvent, ReactNode } from 'react';

interface TopBarProps {
  $isVariableTypesList: boolean;
  $collapsed: boolean;
}

const TopBar = styled(
  'div',
  transientOptions,
)<TopBarProps>(
  ({ $isVariableTypesList, $collapsed }) => `
    display: flex;
    align-items: center;
    justify-content: space-between;
    height: 44px;
    padding: 2px 8px;
    border-radius: ${
      !$isVariableTypesList
        ? $collapsed
          ? lengths.borderRadius
          : `${lengths.borderRadius} ${lengths.borderRadius} 0 0`
        : $collapsed
        ? `0 ${lengths.borderRadius} ${lengths.borderRadius} ${lengths.borderRadius}`
        : `0 ${lengths.borderRadius} 0 0`
    };
    position: relative;
  `,
);

const TopBarButton = styled('button')`
  ${buttons.button};
  color: ${colors.controlLabel};
  background: transparent;
  font-size: 16px;
  line-height: 1;
  padding: 0;
  width: 32px;
  text-align: center;
  cursor: pointer;
  display: flex;
  justify-content: center;
  align-items: center;
  position: relative;
`;

const StyledTitle = styled('div')`
  position: absolute;
  top: 0;
  left: 48px;
  line-height: 40px;
  white-space: nowrap;
  cursor: pointer;
  display: flex;
  align-items: center;
  z-index: 1;
`;

const TopBarButtonSpan = TopBarButton.withComponent('span');

const DragIconContainer = styled(TopBarButtonSpan)`
  width: 100%;
  cursor: move;
`;

export interface DragHandleProps {
  dragHandleHOC: (render: () => ReactNode) => ComponentClass;
}

const DragHandle = ({ dragHandleHOC }: DragHandleProps) => {
  const Handle = dragHandleHOC(() => (
    <DragIconContainer>
      <DragHandleIcon />
    </DragIconContainer>
  ));
  return <Handle />;
};

export interface ListItemTopBarProps {
  className?: string;
  title: ReactNode;
  collapsed?: boolean;
  onCollapseToggle?: (event: MouseEvent) => void;
  onRemove: (event: MouseEvent) => void;
  dragHandleHOC: (render: () => ReactNode) => ComponentClass;
  isVariableTypesList?: boolean;
}

const ListItemTopBar = ({
  className,
  title,
  collapsed = false,
  onCollapseToggle,
  onRemove,
  dragHandleHOC,
  isVariableTypesList = false,
}: ListItemTopBarProps) => {
  return (
    <TopBar className={className} $collapsed={collapsed} $isVariableTypesList={isVariableTypesList}>
      {onCollapseToggle ? (
        <IconButton onClick={onCollapseToggle} data-testid="expand-button">
          <ExpandMoreIcon
            sx={{
              transform: `rotateZ(${collapsed ? '-90deg' : '0deg'})`,
              transition: `transform ${transitions.main};`,
            }}
          />
        </IconButton>
      ) : null}
      <StyledTitle key="title" onClick={onCollapseToggle}>
        {title}
      </StyledTitle>
      {dragHandleHOC ? <DragHandle dragHandleHOC={dragHandleHOC} /> : null}
      {onRemove ? (
        <TopBarButton onClick={onRemove}>
          <CloseIcon />
        </TopBarButton>
      ) : null}
    </TopBar>
  );
};

export default ListItemTopBar;
