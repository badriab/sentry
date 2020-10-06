import PropTypes from 'prop-types';
import React from 'react';
import classNames from 'classnames';
import scrollToElement from 'scroll-to-element';
import styled from '@emotion/styled';

import Button from 'app/components/button';
import {defined, objectIsEmpty} from 'app/utils';
import {t} from 'app/locale';
import TogglableAddress, {
  TogglableAddressIcon,
} from 'app/components/events/interfaces/togglableAddress';
import PackageLink from 'app/components/events/interfaces/packageLink';
import PackageStatus, {
  PackageStatusIcon,
} from 'app/components/events/interfaces/packageStatus';
import StrictClick from 'app/components/strictClick';
import Tooltip from 'app/components/tooltip';
import space from 'app/styles/space';
import withSentryAppComponents from 'app/utils/withSentryAppComponents';
import {DebugMetaActions} from 'app/stores/debugMetaStore';
import {SymbolicatorStatus} from 'app/components/events/interfaces/types';
import {combineStatus} from 'app/components/events/interfaces/debugMeta/utils';
import {IconRefresh, IconChevron, IconQuestion, IconWarning} from 'app/icons';
import overflowEllipsis from 'app/styles/overflowEllipsis';
import {Frame, SentryAppComponent, PlatformType} from 'app/types';
import DebugImage from 'app/components/events/interfaces/debugMeta/debugImage';
import {ListItem} from 'app/components/list';

import FrameDefaultTitle from './frameDefaultTitle';
import FrameContext from './frameContext';
import FrameFunctionName from './frameFunctionName';
import {getPlatform} from './utils';

type Props = {
  data: Frame;
  nextFrame: Frame;
  prevFrame: Frame;
  platform: PlatformType;
  emptySourceNotation: boolean;
  isOnlyFrame: boolean;
  timesRepeated: number;
  registers: Record<string, string>;
  components: Array<SentryAppComponent>;
  showingAbsoluteAddress: boolean;
  onAddressToggle: React.MouseEventHandler<SVGElement>;
  image: React.ComponentProps<typeof DebugImage>['image'];
  maxLengthOfRelativeAddress: number;
  isExpanded?: boolean;
};

type State = {
  isExpanded?: boolean;
};

export class FrameLine extends React.Component<Props, State> {
  static propTypes: any = {
    data: PropTypes.object.isRequired,
    nextFrame: PropTypes.object,
    prevFrame: PropTypes.object,
    platform: PropTypes.string,
    isExpanded: PropTypes.bool,
    emptySourceNotation: PropTypes.bool,
    isOnlyFrame: PropTypes.bool,
    timesRepeated: PropTypes.number,
    registers: PropTypes.objectOf(PropTypes.string.isRequired),
    components: PropTypes.array.isRequired,
    showingAbsoluteAddress: PropTypes.bool,
    onAddressToggle: PropTypes.func,
    image: PropTypes.object,
    maxLengthOfRelativeAddress: PropTypes.number,
  };

  static defaultProps = {
    isExpanded: false,
    emptySourceNotation: false,
  };

  // isExpanded can be initialized to true via parent component;
  // data synchronization is not important
  // https://facebook.github.io/react/tips/props-in-getInitialState-as-anti-pattern.html
  state = {
    isExpanded: this.props.isExpanded,
  };

  toggleContext = evt => {
    evt && evt.preventDefault();

    this.setState({
      isExpanded: !this.state.isExpanded,
    });
  };

  hasContextSource() {
    return defined(this.props.data.context) && !!this.props.data.context.length;
  }

  hasContextVars() {
    return !objectIsEmpty(this.props.data.vars);
  }

  hasContextRegisters() {
    return !objectIsEmpty(this.props.registers);
  }

  hasAssembly() {
    return this.getPlatform() === 'csharp' && defined(this.props.data.package);
  }

  isExpandable() {
    return (
      (!this.props.isOnlyFrame && this.props.emptySourceNotation) ||
      this.hasContextSource() ||
      this.hasContextVars() ||
      this.hasContextRegisters() ||
      this.hasAssembly()
    );
  }

  getPlatform() {
    // prioritize the frame platform but fall back to the platform
    // of the stacktrace / exception
    return getPlatform(this.props.data.platform, this.props.platform);
  }

  isInlineFrame() {
    return (
      this.props.prevFrame &&
      this.getPlatform() === (this.props.prevFrame.platform || this.props.platform) &&
      this.props.data.instructionAddr === this.props.prevFrame.instructionAddr
    );
  }

  shouldShowLinkToImage() {
    const {symbolicatorStatus} = this.props.data;

    return (
      !!symbolicatorStatus && symbolicatorStatus !== SymbolicatorStatus.UNKNOWN_IMAGE
    );
  }

  packageStatus() {
    // this is the status of image that belongs to this frame
    const {image} = this.props;
    if (!image) {
      return 'empty';
    }

    const combinedStatus = combineStatus(image.debug_status, image.unwind_status);

    switch (combinedStatus) {
      case 'unused':
        return 'empty';
      case 'found':
        return 'success';
      default:
        return 'error';
    }
  }

  scrollToImage = event => {
    event.stopPropagation(); // to prevent collapsing if collapsable
    DebugMetaActions.updateFilter(this.props.data.instructionAddr);
    scrollToElement('#packages');
  };

  preventCollapse = evt => {
    evt.stopPropagation();
  };

  renderExpander() {
    if (!this.isExpandable()) {
      return null;
    }

    const {isExpanded} = this.state;

    return (
      <ToogleContextButton title={t('Toggle Context')} onClick={this.toggleContext}>
        <StyledIconChevron
          isExpanded={!!isExpanded}
          direction={isExpanded ? 'up' : 'down'}
          size="8px"
        />
      </ToogleContextButton>
    );
  }

  leadsToApp() {
    return !this.props.data.inApp && this.props.nextFrame && this.props.nextFrame.inApp;
  }

  isFoundByStackScanning() {
    const {data} = this.props;

    return data.trust === 'scan' || data.trust === 'cfi-scan';
  }

  getFrameHint() {
    // returning [hintText, hintIcon]
    const {symbolicatorStatus} = this.props.data;
    const func = this.props.data.function || '<unknown>';
    // Custom color used to match adjacent text.
    const warningIcon = <IconQuestion size="xs" color={'#2c45a8' as any} />;
    const errorIcon = <IconWarning size="xs" color="red400" />;

    if (func.match(/^@objc\s/)) {
      return [t('Objective-C -> Swift shim frame'), warningIcon];
    }
    if (func.match(/^__?hidden#\d+/)) {
      return [t('Hidden function from bitcode build'), errorIcon];
    }
    if (!symbolicatorStatus && func === '<unknown>') {
      // Only render this if the event was not symbolicated.
      return [t('No function name was supplied by the client SDK.'), warningIcon];
    }

    if (
      func === '<unknown>' ||
      (func === '<redacted>' && symbolicatorStatus === SymbolicatorStatus.MISSING_SYMBOL)
    ) {
      switch (symbolicatorStatus) {
        case SymbolicatorStatus.MISSING_SYMBOL:
          return [t('The symbol was not found within the debug file.'), warningIcon];
        case SymbolicatorStatus.UNKNOWN_IMAGE:
          return [t('No image is specified for the address of the frame.'), warningIcon];
        case SymbolicatorStatus.MISSING:
          return [
            t('The debug file could not be retrieved from any of the sources.'),
            errorIcon,
          ];
        case SymbolicatorStatus.MALFORMED:
          return [t('The retrieved debug file could not be processed.'), errorIcon];
        default:
      }
    }

    if (func === '<redacted>') {
      return [t('Unknown system frame. Usually from beta SDKs'), warningIcon];
    }

    return [null, null];
  }

  renderLeadHint() {
    if (this.leadsToApp() && !this.state.isExpanded) {
      return <LeadHint className="leads-to-app-hint">{t('Called from: ')}</LeadHint>;
    } else {
      return null;
    }
  }

  renderRepeats() {
    const timesRepeated = this.props.timesRepeated;
    if (timesRepeated > 0) {
      return (
        <RepeatedFrames
          title={`Frame repeated ${timesRepeated} time${timesRepeated === 1 ? '' : 's'}`}
        >
          <RepeatedContent>
            <StyledIconRefresh />
            <span>{timesRepeated}</span>
          </RepeatedContent>
        </RepeatedFrames>
      );
    } else {
      return null;
    }
  }

  renderDefaultLine() {
    return (
      <StrictClick onClick={this.isExpandable() ? this.toggleContext : undefined}>
        <DefaultLine className="title">
          <VertCenterWrapper>
            <div>
              {this.renderLeadHint()}
              <FrameDefaultTitle frame={this.props.data} platform={this.props.platform} />
            </div>
            {this.renderRepeats()}
          </VertCenterWrapper>
          {this.renderExpander()}
        </DefaultLine>
      </StrictClick>
    );
  }

  renderNativeLine() {
    const {
      data,
      showingAbsoluteAddress,
      onAddressToggle,
      image,
      maxLengthOfRelativeAddress,
    } = this.props;
    const [hint, hintIcon] = this.getFrameHint();

    const enablePathTooltip = defined(data.absPath) && data.absPath !== data.filename;
    const leadHint = this.renderLeadHint();

    return (
      <StrictClick onClick={this.isExpandable() ? this.toggleContext : undefined}>
        <DefaultLine className="title as-table">
          <NativeLineContent>
            <PackageInfo>
              {leadHint}
              <PackageLink
                withLeadHint={leadHint !== null}
                packagePath={data.package}
                onClick={this.scrollToImage}
                isClickable={this.shouldShowLinkToImage()}
              >
                <PackageStatus status={this.packageStatus()} />
              </PackageLink>
            </PackageInfo>
            {data.instructionAddr && (
              <TogglableAddress
                address={data.instructionAddr}
                startingAddress={image ? image.image_addr : null}
                isAbsolute={showingAbsoluteAddress}
                isFoundByStackScanning={this.isFoundByStackScanning()}
                isInlineFrame={this.isInlineFrame()}
                onToggle={onAddressToggle}
                relativeAddressMaxlength={maxLengthOfRelativeAddress}
              />
            )}
            <Symbol>
              <FrameFunctionName frame={data} />{' '}
              {hint !== null && (
                <HintStatus>
                  <Tooltip title={hint}>{hintIcon}</Tooltip>
                </HintStatus>
              )}
              {data.filename && (
                <Tooltip title={data.absPath} disabled={!enablePathTooltip}>
                  <Filename>
                    {data.filename}
                    {data.lineNo ? `: ${data.lineNo}` : ''}
                  </Filename>
                </Tooltip>
              )}
            </Symbol>
          </NativeLineContent>
          {this.renderExpander()}
        </DefaultLine>
      </StrictClick>
    );
  }

  renderLine() {
    switch (this.getPlatform()) {
      case 'objc':
      // fallthrough
      case 'cocoa':
      // fallthrough
      case 'native':
        return this.renderNativeLine();
      default:
        return this.renderDefaultLine();
    }
  }

  render() {
    const data = this.props.data;

    const className = classNames({
      frame: true,
      'is-expandable': this.isExpandable(),
      expanded: this.state.isExpanded,
      collapsed: !this.state.isExpanded,
      'system-frame': !data.inApp,
      'frame-errors': data.errors,
      'leads-to-app': this.leadsToApp(),
      [this.getPlatform()]: true,
    });
    const props = {className};

    return (
      <StyledListItem {...props}>
        {this.renderLine()}
        <FrameContext
          frame={data}
          registers={this.props.registers}
          components={this.props.components}
          hasContextSource={this.hasContextSource()}
          hasContextVars={this.hasContextVars()}
          hasContextRegisters={this.hasContextRegisters()}
          emptySourceNotation={this.props.emptySourceNotation}
          hasAssembly={this.hasAssembly()}
          expandable={this.isExpandable()}
          isExpanded={this.state.isExpanded}
        />
      </StyledListItem>
    );
  }
}

const RepeatedFrames = styled('div')`
  display: inline-block;
  border-radius: 50px;
  padding: 1px 3px;
  margin-left: ${space(1)};
  border-width: thin;
  border-style: solid;
  border-color: ${p => p.theme.orange500};
  color: ${p => p.theme.orange500};
  background-color: ${p => p.theme.gray100};
  white-space: nowrap;
`;

const VertCenterWrapper = styled('div')`
  display: flex;
  align-items: center;
`;

const RepeatedContent = styled(VertCenterWrapper)`
  justify-content: center;
`;

const PackageInfo = styled('div')`
  display: grid;
  grid-template-columns: auto 1fr;
  order: 2;
  align-items: flex-start;
  @media (min-width: ${props => props.theme.breakpoints[0]}) {
    order: 0;
  }
`;

const NativeLineContent = styled('div')`
  display: grid;
  flex: 1;
  grid-gap: ${space(0.5)};
  grid-template-columns: 117px 1fr;
  align-items: flex-start;
  justify-content: flex-start;

  @media (min-width: ${props => props.theme.breakpoints[0]}) {
    grid-template-columns: 150px 117px 1fr auto;
  }

  @media (min-width: ${props => props.theme.breakpoints[2]}) and (max-width: ${props =>
      props.theme.breakpoints[3]}) {
    grid-template-columns: 130px 117px 1fr auto;
  }
`;

const DefaultLine = styled('div')`
  display: grid;
  grid-template-columns: 1fr auto;
  align-items: center;
`;

const HintStatus = styled('span')`
  position: relative;
  top: ${space(0.25)};
  margin: 0 ${space(0.75)} 0 -${space(0.25)};
`;

const Symbol = styled('span')`
  text-align: left;
  grid-column-start: 1;
  grid-column-end: -1;
  order: 3;

  word-break: break-word;
  flex: 1;

  code {
    background: transparent;
    color: ${p => p.theme.gray800};
    padding-right: ${space(0.5)};
  }

  @media (min-width: ${props => props.theme.breakpoints[0]}) {
    order: 0;
    grid-column-start: auto;
    grid-column-end: auto;
  }
`;

const Filename = styled('span')`
  color: ${p => p.theme.purple400};
  margin-right: ${space(0.5)};

  :before {
    content: '(';
  }

  :after {
    content: ')';
  }
`;

const StyledIconRefresh = styled(IconRefresh)`
  margin-right: ${space(0.25)};
`;

const LeadHint = styled('div')`
  ${overflowEllipsis}
  width: 67px;
`;

const StyledIconChevron = styled(IconChevron)<{isExpanded: boolean}>`
  transform: rotate(${p => (p.isExpanded ? '180deg' : '0deg')});
  transition: 0.1s all;
`;

// the Buton's label has the padding of 3px because the button size has to be 16x16 px.
const ToogleContextButton = styled(Button)`
  span:first-child {
    padding: 3px;
  }
`;

const StyledListItem = styled(ListItem)`
  padding-left: 0;
  flex-direction: column;
  align-items: flex-start;
  ${PackageStatusIcon} {
    opacity: 0;
    flex-shrink: 0;
  }
  :hover {
    ${PackageStatusIcon} {
      opacity: 1;
    }
    ${TogglableAddressIcon} {
      visibility: visible;
    }
  }
  ul &:before {
    content: none;
  }
  > *:first-child {
    flex: 1;
    width: 100%;
  }
`;

export default withSentryAppComponents(FrameLine, {componentType: 'stacktrace-link'});
