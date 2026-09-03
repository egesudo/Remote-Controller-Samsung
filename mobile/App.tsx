import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  SafeAreaView,
  Modal,
  TextInput,
  Vibration,
  StatusBar,
  ScrollView,
} from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import {
  mobileTvController,
  ConnectionState,
  ValidRemoteKey,
} from './src/engine/samsungTvController.native';

const TARGET_MODEL = 'UE55TU8500';

export default function App() {
  const [ip, setIp] = useState('192.168.1.50');
  const [connectionState, setConnectionState] = useState<ConnectionState>('DISCONNECTED');
  const [tokenMasked, setTokenMasked] = useState<string | null>(null);
  const [modalVisible, setModalVisible] = useState(false);
  const [lastDispatched, setLastDispatched] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    // Load stored token initially
    mobileTvController.getStoredToken(ip).then((token) => {
      setTokenMasked(mobileTvController.getMaskedToken(token));
    });

    const unsubscribe = mobileTvController.addListener({
      onStateChange: (state) => {
        setConnectionState(state);
        if (state === 'CONNECTED') {
          setErrorMessage(null);
        }
      },
      onTokenChange: (mask) => {
        setTokenMasked(mask);
      },
      onError: (err) => {
        setErrorMessage(err);
      },
    });

    return () => {
      unsubscribe();
    };
  }, [ip]);

  const triggerHaptic = () => {
    Vibration.vibrate(35);
  };

  const handleSendKey = async (key: ValidRemoteKey) => {
    triggerHaptic();
    setLastDispatched(key);
    await mobileTvController.sendKey(key);
  };

  const handleConnect = async () => {
    setErrorMessage(null);
    await mobileTvController.connect({
      host: ip,
      port: 8002,
      appName: 'SamsungMobileRemote',
      autoReconnect: true,
    });
  };

  const handleDisconnect = () => {
    mobileTvController.disconnect();
  };

  const isConnected = connectionState === 'CONNECTED';
  const isPairing = connectionState === 'PAIRING';

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#020617" />

      {/* Header Bar */}
      <View style={styles.header}>
        <View style={styles.deviceInfo}>
          <MaterialCommunityIcons name="television" size={24} color={isConnected ? '#34d399' : '#94a3b8'} />
          <View style={styles.deviceTexts}>
            <View style={styles.titleRow}>
              <Text style={styles.headerTitle}>Samsung TV</Text>
              <View
                style={[
                  styles.statusDot,
                  { backgroundColor: isConnected ? '#10b981' : isPairing ? '#f59e0b' : '#f43f5e' },
                ]}
              />
            </View>
            <Text style={styles.headerSubtitle}>{TARGET_MODEL} • {ip}</Text>
          </View>
        </View>

        <View style={styles.headerActions}>
          <TouchableOpacity
            style={styles.iconButton}
            onPress={() => setModalVisible(true)}
          >
            <Ionicons name="settings-outline" size={20} color="#cbd5e1" />
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.iconButton, styles.powerButton, isConnected && styles.powerButtonActive]}
            disabled={!isConnected}
            onPress={() => handleSendKey('KEY_POWER')}
          >
            <Ionicons name="power" size={20} color={isConnected ? '#f43f5e' : '#64748b'} />
          </TouchableOpacity>
        </View>
      </View>

      {/* Pairing Alert Banner */}
      {isPairing && (
        <View style={styles.pairingBanner}>
          <Ionicons name="warning-outline" size={18} color="#f59e0b" />
          <View style={{ flex: 1, marginLeft: 8 }}>
            <Text style={styles.pairingTitle}>Pairing in progress</Text>
            <Text style={styles.pairingDesc}>
              Look at your TV screen and select "Allow" with the physical remote.
            </Text>
          </View>
        </View>
      )}

      {/* Dispatched Key Toast */}
      {lastDispatched && (
        <View style={styles.toastContainer}>
          <Text style={styles.toastText}>Sent: {lastDispatched}</Text>
        </View>
      )}

      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* D-PAD NAVIGATION */}
        <View style={styles.dpadContainer}>
          <View style={styles.dpadCircle}>
            <TouchableOpacity
              style={[styles.dpadBtn, styles.dpadUp]}
              disabled={!isConnected}
              onPress={() => handleSendKey('KEY_UP')}
            >
              <Ionicons name="chevron-up" size={28} color="#f8fafc" />
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.dpadBtn, styles.dpadDown]}
              disabled={!isConnected}
              onPress={() => handleSendKey('KEY_DOWN')}
            >
              <Ionicons name="chevron-down" size={28} color="#f8fafc" />
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.dpadBtn, styles.dpadLeft]}
              disabled={!isConnected}
              onPress={() => handleSendKey('KEY_LEFT')}
            >
              <Ionicons name="chevron-back" size={28} color="#f8fafc" />
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.dpadBtn, styles.dpadRight]}
              disabled={!isConnected}
              onPress={() => handleSendKey('KEY_RIGHT')}
            >
              <Ionicons name="chevron-forward" size={28} color="#f8fafc" />
            </TouchableOpacity>

            {/* CENTER OK / ENTER */}
            <TouchableOpacity
              style={styles.dpadCenter}
              disabled={!isConnected}
              onPress={() => handleSendKey('KEY_ENTER')}
            >
              <Text style={styles.dpadCenterText}>OK</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* SYSTEM KEYS: BACK & HOME */}
        <View style={styles.systemKeysRow}>
          <TouchableOpacity
            style={styles.systemBtn}
            disabled={!isConnected}
            onPress={() => handleSendKey('KEY_RETURN')}
          >
            <Ionicons name="return-up-back" size={18} color="#cbd5e1" />
            <Text style={styles.systemBtnText}>Back</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.systemBtn}
            disabled={!isConnected}
            onPress={() => handleSendKey('KEY_HOME')}
          >
            <Ionicons name="home-outline" size={18} color="#cbd5e1" />
            <Text style={styles.systemBtnText}>Home</Text>
          </TouchableOpacity>
        </View>

        {/* VOLUME & CHANNEL ROCKERS + MUTE */}
        <View style={styles.rockersRow}>
          {/* Volume Rocker */}
          <View style={styles.rocker}>
            <TouchableOpacity
              style={styles.rockerTop}
              disabled={!isConnected}
              onPress={() => handleSendKey('KEY_VOLUP')}
            >
              <Text style={styles.rockerSign}>+</Text>
            </TouchableOpacity>
            <Text style={styles.rockerLabel}>VOL</Text>
            <TouchableOpacity
              style={styles.rockerBottom}
              disabled={!isConnected}
              onPress={() => handleSendKey('KEY_VOLDOWN')}
            >
              <Text style={styles.rockerSign}>-</Text>
            </TouchableOpacity>
          </View>

          {/* Mute Center */}
          <TouchableOpacity
            style={styles.muteBtn}
            disabled={!isConnected}
            onPress={() => handleSendKey('KEY_MUTE')}
          >
            <Ionicons name="volume-mute-outline" size={24} color="#f59e0b" />
            <Text style={styles.muteText}>Mute</Text>
          </TouchableOpacity>

          {/* Channel Rocker */}
          <View style={styles.rocker}>
            <TouchableOpacity
              style={styles.rockerTop}
              disabled={!isConnected}
              onPress={() => handleSendKey('KEY_CHUP')}
            >
              <Text style={styles.rockerSign}>+</Text>
            </TouchableOpacity>
            <Text style={styles.rockerLabel}>CH</Text>
            <TouchableOpacity
              style={styles.rockerBottom}
              disabled={!isConnected}
              onPress={() => handleSendKey('KEY_CHDOWN')}
            >
              <Text style={styles.rockerSign}>-</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* MEDIA CONTROLS ROW */}
        <View style={styles.mediaRow}>
          <TouchableOpacity
            style={styles.mediaBtn}
            disabled={!isConnected}
            onPress={() => handleSendKey('KEY_PLAY')}
          >
            <Ionicons name="play" size={18} color="#cbd5e1" />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.mediaBtn}
            disabled={!isConnected}
            onPress={() => handleSendKey('KEY_PAUSE')}
          >
            <Ionicons name="pause" size={18} color="#cbd5e1" />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.mediaBtn}
            disabled={!isConnected}
            onPress={() => handleSendKey('KEY_STOP')}
          >
            <Ionicons name="stop" size={18} color="#cbd5e1" />
          </TouchableOpacity>
        </View>
      </ScrollView>

      {/* Settings Modal */}
      <Modal visible={modalVisible} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>TV Connection Settings</Text>
              <TouchableOpacity onPress={() => setModalVisible(false)}>
                <Ionicons name="close" size={22} color="#94a3b8" />
              </TouchableOpacity>
            </View>

            <Text style={styles.inputLabel}>Samsung TV IP Address</Text>
            <TextInput
              style={styles.input}
              value={ip}
              onChangeText={setIp}
              placeholder="e.g. 192.168.1.50"
              placeholderTextColor="#64748b"
              keyboardType="numeric"
            />

            <View style={styles.statusBox}>
              <Text style={styles.statusBoxText}>
                Status: <Text style={{ color: isConnected ? '#34d399' : '#f87171' }}>{connectionState}</Text>
              </Text>
              <Text style={styles.statusBoxText}>
                Token: <Text style={{ color: '#cbd5e1' }}>{tokenMasked || 'None (Pairing Required)'}</Text>
              </Text>
            </View>

            {errorMessage && (
              <Text style={styles.errorText}>{errorMessage}</Text>
            )}

            <View style={styles.modalActions}>
              {!isConnected ? (
                <TouchableOpacity style={styles.connectBtn} onPress={handleConnect}>
                  <Text style={styles.connectBtnText}>Connect / Pair TV</Text>
                </TouchableOpacity>
              ) : (
                <TouchableOpacity style={styles.disconnectBtn} onPress={handleDisconnect}>
                  <Text style={styles.disconnectBtnText}>Disconnect</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#020617',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#1e293b',
  },
  deviceInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  deviceTexts: {
    flexDirection: 'column',
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#f8fafc',
  },
  headerSubtitle: {
    fontSize: 11,
    color: '#64748b',
    fontFamily: 'Courier',
    marginTop: 2,
  },
  statusDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  iconButton: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: '#0f172a',
    alignItems: 'center',
    justifyContent: 'center',
  },
  powerButton: {
    backgroundColor: 'rgba(244, 63, 94, 0.15)',
  },
  powerButtonActive: {
    backgroundColor: 'rgba(244, 63, 94, 0.25)',
  },
  pairingBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(245, 158, 11, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(245, 158, 11, 0.3)',
    marginHorizontal: 16,
    marginTop: 10,
    padding: 10,
    borderRadius: 12,
  },
  pairingTitle: {
    color: '#fbbf24',
    fontSize: 12,
    fontWeight: '700',
  },
  pairingDesc: {
    color: '#fde68a',
    fontSize: 11,
    marginTop: 2,
  },
  toastContainer: {
    alignSelf: 'center',
    backgroundColor: '#1e1b4b',
    borderWidth: 1,
    borderColor: '#4338ca',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 16,
    marginTop: 6,
  },
  toastText: {
    color: '#a5b4fc',
    fontSize: 10,
    fontFamily: 'Courier',
  },
  scrollContent: {
    paddingVertical: 20,
    alignItems: 'center',
  },
  dpadContainer: {
    marginVertical: 12,
  },
  dpadCircle: {
    width: 200,
    height: 200,
    borderRadius: 100,
    backgroundColor: '#0f172a',
    borderWidth: 2,
    borderColor: '#1e293b',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  dpadBtn: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dpadUp: {
    top: 6,
    width: 60,
    height: 48,
  },
  dpadDown: {
    bottom: 6,
    width: 60,
    height: 48,
  },
  dpadLeft: {
    left: 6,
    width: 48,
    height: 60,
  },
  dpadRight: {
    right: 6,
    width: 48,
    height: 60,
  },
  dpadCenter: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: '#1e293b',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#334155',
  },
  dpadCenterText: {
    color: '#f8fafc',
    fontSize: 14,
    fontWeight: '700',
  },
  systemKeysRow: {
    flexDirection: 'row',
    width: '84%',
    justifyContent: 'space-between',
    marginVertical: 14,
    gap: 16,
  },
  systemBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#0f172a',
    borderWidth: 1,
    borderColor: '#1e293b',
    paddingVertical: 12,
    borderRadius: 16,
  },
  systemBtnText: {
    color: '#cbd5e1',
    fontSize: 13,
    fontWeight: '600',
  },
  rockersRow: {
    flexDirection: 'row',
    width: '84%',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginVertical: 14,
  },
  rocker: {
    width: 64,
    height: 120,
    borderRadius: 32,
    backgroundColor: '#0f172a',
    borderWidth: 1,
    borderColor: '#1e293b',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
  },
  rockerTop: {
    width: '100%',
    alignItems: 'center',
    paddingVertical: 6,
  },
  rockerBottom: {
    width: '100%',
    alignItems: 'center',
    paddingVertical: 6,
  },
  rockerSign: {
    color: '#f8fafc',
    fontSize: 18,
    fontWeight: '700',
  },
  rockerLabel: {
    color: '#64748b',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1,
  },
  muteBtn: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#0f172a',
    borderWidth: 1,
    borderColor: '#1e293b',
    alignItems: 'center',
    justifyContent: 'center',
  },
  muteText: {
    color: '#f59e0b',
    fontSize: 9,
    fontWeight: '600',
    marginTop: 2,
  },
  mediaRow: {
    flexDirection: 'row',
    width: '84%',
    justifyContent: 'space-around',
    backgroundColor: 'rgba(15, 23, 42, 0.6)',
    borderWidth: 1,
    borderColor: '#1e293b',
    borderRadius: 16,
    paddingVertical: 8,
    marginTop: 10,
  },
  mediaBtn: {
    padding: 10,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    padding: 20,
  },
  modalContent: {
    backgroundColor: '#0f172a',
    borderRadius: 24,
    borderWidth: 1,
    borderColor: '#1e293b',
    padding: 20,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#f8fafc',
  },
  inputLabel: {
    fontSize: 12,
    color: '#94a3b8',
    marginBottom: 6,
    fontWeight: '600',
  },
  input: {
    backgroundColor: '#1e293b',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: '#f8fafc',
    fontFamily: 'Courier',
    fontSize: 14,
    marginBottom: 14,
  },
  statusBox: {
    backgroundColor: '#020617',
    padding: 12,
    borderRadius: 12,
    gap: 4,
    marginBottom: 14,
  },
  statusBoxText: {
    fontSize: 12,
    color: '#94a3b8',
  },
  errorText: {
    color: '#f87171',
    fontSize: 12,
    marginBottom: 10,
  },
  modalActions: {
    marginTop: 8,
  },
  connectBtn: {
    backgroundColor: '#4f46e5',
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: 'center',
  },
  connectBtnText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '700',
  },
  disconnectBtn: {
    backgroundColor: 'rgba(244, 63, 94, 0.2)',
    borderWidth: 1,
    borderColor: 'rgba(244, 63, 94, 0.4)',
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: 'center',
  },
  disconnectBtnText: {
    color: '#fb7185',
    fontSize: 14,
    fontWeight: '700',
  },
});
