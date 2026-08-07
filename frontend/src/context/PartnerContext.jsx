import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { clearCache, createPartner as createPartnerApi, getPartners, loadWithCache, updatePartner as updatePartnerApi } from '../utils/pilot2Api';

const PartnerContext = createContext(null);
const SELECTED_PARTNER_KEY = 'pm_selected_partner_id';

function readSelectedPartnerId() {
  try {
    return localStorage.getItem(SELECTED_PARTNER_KEY) || '';
  } catch {
    return '';
  }
}

function writeSelectedPartnerId(value) {
  try {
    if (value) localStorage.setItem(SELECTED_PARTNER_KEY, value);
    else localStorage.removeItem(SELECTED_PARTNER_KEY);
  } catch {
    /* ignore */
  }
}

export function PartnerProvider({ children }) {
  const [partners, setPartners] = useState([]);
  const [selectedPartnerId, setSelectedPartnerIdState] = useState(readSelectedPartnerId());

  const refreshPartners = async () => {
    const fresh = await loadWithCache('partners_list', getPartners, (rows) => {
      setPartners(Array.isArray(rows) ? rows : []);
    });
    const list = Array.isArray(fresh) ? fresh : [];
    setPartners(list);
    if (list.length === 0) {
      setSelectedPartnerId('');
      return list;
    }
    const selectedExists = list.some((partner) => partner.id === selectedPartnerId);
    if (!selectedExists) {
      setSelectedPartnerId(list[0].id);
    }
    return list;
  };

  useEffect(() => {
    refreshPartners().catch(() => setPartners([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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