'use client';
import * as React from 'react';
import { useMaybeLayoutContext, MediaDeviceMenu } from '@livekit/components-react';
import styles from '../styles/SettingsMenu.module.css';
import { CameraSettings } from './CameraSettings';
import { MicrophoneSettings } from './MicrophoneSettings';
import { useRecording } from './ailink/useRecording';

/**
 * @alpha
 */
export interface SettingsMenuProps extends React.HTMLAttributes<HTMLDivElement> {
  onClose?: () => void;
  /**
   * True when this is an interview whose recording is managed server-side
   * (LiveKit Egress). The manual Start/Stop control is disabled in that case.
   */
  recordingEnabled?: boolean;
}

/**
 * @alpha
 */
export function SettingsMenu(props: SettingsMenuProps) {
  const layoutContext = useMaybeLayoutContext();
  const recordingEndpoint = process.env.NEXT_PUBLIC_LK_RECORD_ENDPOINT;
  const recording = useRecording();
  // Strip non-DOM props before spreading the rest onto the <div> — otherwise
  // React warns "does not recognize the `recordingEnabled` prop on a DOM
  // element" (it was spread via {...props}).
  const { recordingEnabled = false, onClose, className, style, ...rest } = props;

  const settings = React.useMemo(() => {
    return {
      media: { camera: true, microphone: true, label: 'Media Devices', speaker: true },
      recording: recordingEndpoint ? { label: 'Recording' } : undefined,
    };
  }, [recordingEndpoint]);

  const tabs = React.useMemo(
    () => Object.keys(settings).filter((t) => t !== undefined) as Array<keyof typeof settings>,
    [settings],
  );
  const [activeTab, setActiveTab] = React.useState(tabs[0]);

  const handleClose = () => {
    if (onClose) {
      onClose();
    } else {
      layoutContext?.widget.dispatch?.({ msg: 'toggle_settings' });
    }
  };

  return (
    <div className={`settings-menu${className ? ` ${className}` : ''}`} style={{ width: '100%', position: 'relative', ...style }} {...rest}>
      <div className={styles.tabs}>
        {tabs.map(
          (tab) =>
            settings[tab] && (
              <button
                className={`${styles.tab} lk-button`}
                key={tab}
                onClick={() => setActiveTab(tab)}
                aria-pressed={tab === activeTab}
              >
                {
                  // @ts-ignore
                  settings[tab].label
                }
              </button>
            ),
        )}
      </div>
      <div className="tab-content">
        {activeTab === 'media' && (
          <>
            {settings.media && settings.media.camera && (
              <>
                <h3>Camera</h3>
                <section>
                  <CameraSettings />
                </section>
              </>
            )}
            {settings.media && settings.media.microphone && (
              <>
                <h3>Microphone</h3>
                <section>
                  <MicrophoneSettings />
                </section>
              </>
            )}
            {settings.media && settings.media.speaker && (
              <>
                <h3>Speaker & Headphones</h3>
                <section className="lk-button-group">
                  <span className="lk-button">Audio Output</span>
                  <div className="lk-button-group-menu">
                    <MediaDeviceMenu kind="audiooutput"></MediaDeviceMenu>
                  </div>
                </section>
              </>
            )}
          </>
        )}
        {activeTab === 'recording' && (
          <>
            <h3>Record Meeting</h3>
            <section>
              <p>
                {recordingEnabled || recording.isRecording
                  ? 'This interview is being recorded'
                  : 'No active recordings for this meeting'}
              </p>
              <button
                disabled={recording.processing || recordingEnabled}
                onClick={() => recording.toggle()}
                title={recordingEnabled ? 'Recording is managed by the interviewer' : undefined}
              >
                {recordingEnabled ? 'Managed by host' : recording.isRecording ? 'Stop' : 'Start'} Recording
              </button>
            </section>
          </>
        )}
      </div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', width: '100%' }}>
        <button className={`lk-button`} onClick={handleClose}>
          Close
        </button>
      </div>
    </div>
  );
}
