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
  const { authReady, user } = useAuth();
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
    
    if (latestSelected === null) {
      setSelectedPartnerId(list[0].id);
    } else {
      const selectedExists = latestSelected === '' || list.some((partner) => partner.id === latestSelected);
      if (!selectedExists) {
        setSelectedPartnerId(list[0].id);
      }
    }
    return list;
  };

  useEffect(() => {
    if (!authReady || !user) return;
    refreshPartners().catch(() => setPartners([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authReady, user]);

  const selectedPartner = useMemo(
    () => partners.find((partner) => partner.id === selectedPartnerId) || null,
    [partners, selectedPartnerId],
  );

  const setSelectedPartnerId = (partnerId) => {
    const next = partnerId || '';
    setSelectedPartnerIdState(next);
    writeSelectedPartnerId(next);
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