import { createContext, useContext, useEffect, useMemo, useState, useRef } from 'react';
import { clearCache, createPartner as createPartnerApi, getPartners, loadWithCache, updatePartner as updatePartnerApi } from '../utils/pilot2Api';
import { useAuth } from './AuthContext';

const PartnerContext = createContext(null);
const SELECTED_PARTNER_KEY = 'pm_selected_partner_id';

function readSelectedPartnerId() {
  try {
    return localStorage.getItem(SELECTED_PARTNER_KEY) ?? null;
  } catch {
    return null;
  }
}

function writeSelectedPartnerId(value) {
  try {
    if (value === null) localStorage.removeItem(SELECTED_PARTNER_KEY);
    else localStorage.setItem(SELECTED_PARTNER_KEY, value);
  } catch {
    /* ignore */
  }
}

export function PartnerProvider({ children }) {
  const { authReady, user, role } = useAuth();
  const [partners, setPartners] = useState([]);
  const [selectedPartnerId, setSelectedPartnerIdState] = useState(readSelectedPartnerId());

  const currentSelectedRef = useRef(selectedPartnerId);
  useEffect(() => {
    currentSelectedRef.current = selectedPartnerId;
  }, [selectedPartnerId]);

  const refreshPartners = async () => {
    const fresh = await loadWithCache('partners_list', getPartners, (rows) => {
      setPartners(Array.isArray(rows) ? rows : []);
    });
    const list = Array.isArray(fresh) ? fresh : [];
    setPartners(list);
    
    const latestSelected = currentSelectedRef.current;
    
    if (list.length === 0) {
      if (latestSelected !== '') setSelectedPartnerId('');
      return list;
    }
    
    const p1 = list.find((p) => p.id === '1' || p.id === 1);
    const defaultPartnerId = p1 ? p1.id : list[0].id;

    if (latestSelected === null || latestSelected === '') {
      setSelectedPartnerId(defaultPartnerId);
    } else {
      const selectedExists = list.some((partner) => partner.id === latestSelected);
      if (!selectedExists) {
        setSelectedPartnerId(defaultPartnerId);
      }
    }
    return list;
  };

  useEffect(() => {
    // /api/partners is admin-only. Managers must not hit it — a 401 on that
    // call fires auth:session-expired and immediately signs them out.
    if (!authReady || !user || role !== 'admin') {
      if (role && role !== 'admin') setPartners([]);
      return;
    }
    refreshPartners().catch(() => setPartners([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authReady, user, role]);

  const selectedPartner = useMemo(
    () => partners.find((partner) => partner.id === selectedPartnerId) || null,
    [partners, selectedPartnerId],
  );

  const partnerLabel = selectedPartner?.name || 'Partner';

  const setSelectedPartnerId = (partnerId) => {
    setSelectedPartnerIdState(partnerId);
    writeSelectedPartnerId(partnerId);
  };

  const createPartner = async (payload) => {
    const created = await createPartnerApi(payload);
    clearCache('partners_list');
    await refreshPartners();
    setSelectedPartnerId(created.id);
    return created;
  };

  const updatePartner = async (partnerId, name) => {
    const updated = await updatePartnerApi(partnerId, name);
    clearCache('partners_list');
    await refreshPartners();
    return updated;
  };

  const value = {
    partners,
    selectedPartnerId,
    selectedPartner,
    partnerLabel,
    setSelectedPartnerId,
    refreshPartners,
    createPartner,
    updatePartner,
  };

  return <PartnerContext.Provider value={value}>{children}</PartnerContext.Provider>;
}

export function usePartners() {
  const ctx = useContext(PartnerContext);
  if (!ctx) {
    throw new Error('usePartners must be used within PartnerProvider');
  }
  return ctx;
}