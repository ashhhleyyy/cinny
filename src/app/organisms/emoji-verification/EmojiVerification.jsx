/* eslint-disable react/prop-types */
import React, { useState, useEffect } from 'react';
import PropTypes from 'prop-types';
import './EmojiVerification.scss';
import { twemojify } from '../../../util/twemojify';

import initMatrix from '../../../client/initMatrix';
import cons from '../../../client/state/cons';
import navigation from '../../../client/state/navigation';
import { hasPrivateKey } from '../../../client/state/secretStorageKeys';
import { getDefaultSSKey, isCrossVerified } from '../../../util/matrixUtil';

import Text from '../../atoms/text/Text';
import IconButton from '../../atoms/button/IconButton';
import Button from '../../atoms/button/Button';
import Spinner from '../../atoms/spinner/Spinner';
import Dialog from '../../molecules/dialog/Dialog';

import CrossIC from '../../../../public/res/ic/outlined/cross.svg';
import { useStore } from '../../hooks/useStore';
import { accessSecretStorage } from '../settings/SecretStorageAccess';

function EmojiVerificationContent({ data, requestClose }) {
  const [sas, setSas] = useState(null);
  const [process, setProcess] = useState(false);
  const { request, targetDevice } = data;
  const mx = initMatrix.matrixClient;
  const mountStore = useStore();

  const beginVerification = async () => {
    if (mx.getCrossSigningId() === null && isCrossVerified(mx.deviceId)) {
      if (!hasPrivateKey(getDefaultSSKey())) {
        const keyData = await accessSecretStorage('Emoji verification');
        if (!keyData) {
          request.cancel();
          return;
        }
      }
      await mx.checkOwnCrossSigningTrust();
    }
    setProcess(true);
    await request.accept();

    const verifier = request.beginKeyVerification('m.sas.v1', targetDevice);

    const handleVerifier = (sasData) => {
      verifier.off('show_sas', handleVerifier);
      if (!mountStore.getItem()) return;
      setSas(sasData);
      setProcess(false);
    };
    verifier.on('show_sas', handleVerifier);
    await verifier.verify();
  };

  const sasMismatch = () => {
    sas.mismatch();
    setProcess(true);
  };

  const sasConfirm = () => {
    sas.confirm();
    setProcess(true);
  };

  useEffect(() => {
    mountStore.setItem(true);
    const handleChange = () => {
      if (targetDevice && request.started) {
        beginVerification();
      }
      if (request.done || request.cancelled) requestClose();
    };

    if (request === null) return null;
    const req = request;
    req.on('change', handleChange);
    return () => {
      req.off('change', handleChange);
      if (!req.cancelled && !req.done) {
        req.cancel();
      }
    };
  }, [request]);

  const renderWait = () => (
    <>
      <Spinner size="small" />
      <Text>Waiting for response from other device...</Text>
    </>
  );

  if (sas !== null) {
    return (
      <div className="emoji-verification__content">
        <Text>Confirm the emoji below are displayed on both devices, in the same order:</Text>
        <div className="emoji-verification__emojis">
          {sas.sas.emoji.map((emoji, i) => (
            // eslint-disable-next-line react/no-array-index-key
            <div className="emoji-verification__emoji-block" key={`${emoji[1]}-${i}`}>
              <Text variant="h1">{twemojify(emoji[0])}</Text>
              <Text>{emoji[1]}</Text>
            </div>
          ))}
        </div>
        <div className="emoji-verification__buttons">
          {process ? renderWait() : (
            <>
              <Button variant="primary" onClick={sasConfirm}>They match</Button>
              <Button onClick={sasMismatch}>{'They don\'t match'}</Button>
            </>
          )}
        </div>
      </div>
    );
  }

  if (targetDevice) {
    return (
      <div className="emoji-verification__content">
        <Text>Please accept the request from other device.</Text>
        <div className="emoji-verification__buttons">
          {renderWait()}
        </div>
      </div>
    );
  }

  return (
    <div className="emoji-verification__content">
      <Text>Click accept to start the verification process.</Text>
      <div className="emoji-verification__buttons">
        {
          process
            ? renderWait()
            : <Button variant="primary" onClick={beginVerification}>Accept</Button>
        }
      </div>
    </div>
  );
}
EmojiVerificationContent.propTypes = {
  data: PropTypes.shape({}).isRequired,
  requestClose: PropTypes.func.isRequired,
};

function useVisibilityToggle() {
  const [data, setData] = useState(null);
  const mx = initMatrix.matrixClient;

  useEffect(() => {
    const handleOpen = (request, targetDevice) => {
      setData({ request, targetDevice });
    };
    navigation.on(cons.events.navigation.EMOJI_VERIFICATION_OPENED, handleOpen);
    mx.on('crypto.verification.request', handleOpen);
    return () => {
      navigation.removeListener(cons.events.navigation.EMOJI_VERIFICATION_OPENED, handleOpen);
      mx.removeListener('crypto.verification.request', handleOpen);
    };
  }, []);

  const requestClose = () => setData(null);

  return [data, requestClose];
}

function EmojiVerification() {
  const [data, requestClose] = useVisibilityToggle();

  return (
    <Dialog
      isOpen={data !== null}
      className="emoji-verification"
      title={(
        <Text variant="s1" weight="medium" primary>
          Emoji verification
        </Text>
      )}
      contentOptions={<IconButton src={CrossIC} onClick={requestClose} tooltip="Close" />}
      onRequestClose={requestClose}
    >
      {
        data !== null
          ? <EmojiVerificationContent data={data} requestClose={requestClose} />
          : <div />
      }
    </Dialog>
  );
}

export default EmojiVerification;
