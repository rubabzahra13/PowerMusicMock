import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { AdminPageScroll, Toast, useToast } from '../components/ui';
import GroupResolutionView from '../components/GroupResolutionView';
import { usePartners } from '../context/PartnerContext';
import { fetchJson } from '../utils/api';
import {
  loadWithCache,
  bumpCacheEpoch,
  refreshCache,
  clearCache,
  writeCache,
  suppressNewRequests,
  REQUESTS_PAGE_CACHE_KEY,
} from '../utils/pilot2Api';
import { fetchGroupDetail } from '../utils/duplicateGroupApi';

function removeResolvedGroupFromRequestsCache(requestsCacheKey, groupId, memberIds) {
  try {
    const raw = sessionStorage.getItem(`pm_cache_${requestsCacheKey}`);
    if (!raw) return;
    const data = JSON.parse(raw);
    if (!Array.isArray(data.requests)) return;
    const ids = new Set(memberIds);
    writeCache(requestsCacheKey, {
      ...data,
      requests: data.requests.filter(
        (row) => !ids.has(row.id) && row.duplicateGroupId !== groupId,
      ),
    });
  } catch {
    /* ignore */
  }
}

export default function GroupDetail() {
  const { groupId } = useParams();
  const navigate = useNavigate();
  const { selectedPartnerId } = usePartners();
  const { showToast } = useToast();

  const [group, setGroup] = useState(null);
  const [directory, setDirectory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  const requestsCacheKey = selectedPartnerId
    ? `${REQUESTS_PAGE_CACHE_KEY}:${selectedPartnerId}`
    : REQUESTS_PAGE_CACHE_KEY;
  const directoryCacheKey = selectedPartnerId
    ? `directory_persons:${selectedPartnerId}`
    : 'directory_persons';

  const goBack = useCallback(() => navigate('/new-requests'), [navigate]);

  const groupCacheKey = `duplicate_group:${groupId}`;

  useEffect(() => {
    let cancelled = false;
    setNotFound(false);
    setLoading(true);

    // Load directory from requests page cache
    loadWithCache(
      requestsCacheKey,
      () => getNewRequestsPage(selectedPartnerId || ''),
      (data) => {
        if (cancelled) return;
        if (Array.isArray(data?.persons)) setDirectory(data.persons);
      },
    ).catch(() => {});

    // Group detail: session cache makes reopen instant; still revalidates in background
    loadWithCache(
      groupCacheKey,
      () => fetchGroupDetail(groupId),
      (data) => {
        if (cancelled) return;
        if (!data || data.status === 'resolved' || data.status === 'dismissed') {
          clearCache(groupCacheKey);
          setNotFound(true);
          setGroup(null);
        } else {
          setGroup(data);
          setNotFound(false);
        }
        setLoading(false);
      },
    ).catch(() => {
      if (cancelled) return;
      setNotFound(true);
      setLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [groupId, groupCacheKey, requestsCacheKey, selectedPartnerId]);

  /** Called by GroupResolutionView when any resolve or unlink action completes. */
  const handleResolved = useCallback(
    async (type, name) => {
      if (type === 'error') {
        showToast(name || 'Something went wrong. Please try again.', 'error');
        return;
      }

      // Instagram-style: drop this item from the feed immediately and keep a
      // short local tombstone so a stale poll cannot resurrect it. Do not
      // refreshCache here — that write-through is what was putting it back.
      const memberIds = (group?.members || []).map((m) => m.id);
      clearCache(groupCacheKey);
      suppressNewRequests({ requestIds: memberIds, groupIds: [groupId] });
      bumpCacheEpoch(requestsCacheKey);
      removeResolvedGroupFromRequestsCache(requestsCacheKey, groupId, memberIds);

      const toastMsg =
        type === 'add'
          ? `${name} added to Directory.`
          : type === 'update'
            ? `Directory record for ${name} updated.`
            : type === 'unlinked_dissolved'
              ? 'Group dissolved successfully.'
              : 'Group resolved. Existing Directory record kept.';

      showToast(toastMsg, 'success');

      // Refresh directory cache in the background for Directory page consistency
      if (type === 'add' || type === 'update') {
        refreshCache(
          directoryCacheKey,
          () =>
            fetchJson(
              `/api/persons${selectedPartnerId ? `?partner_id=${encodeURIComponent(selectedPartnerId)}` : ''}`,
            ),
          () => {},
        ).catch(() => {});
        if (type === 'add') {
          sessionStorage.setItem('pm_directory_pending_tab', 'Added');
        }
      }

      navigate('/new-requests');
    },
    [navigate, group, groupId, requestsCacheKey, groupCacheKey, directoryCacheKey, selectedPartnerId, showToast],
  );

  /* ── loading state ── */
  if (loading) {
    return (
      <AdminPageScroll contentClassName="flex min-h-full items-center justify-center text-sm text-[var(--color-text-secondary)] select-none">
        Loading request…
      </AdminPageScroll>
    );
  }

  /* ── not found / already resolved ── */
  if (notFound || !group) {
    return (
      <AdminPageScroll contentClassName="flex min-h-full items-center justify-center select-none">
        <div className="mx-auto flex max-w-lg flex-col items-center gap-4 text-center">
          <div>
            <h1 className="text-lg font-semibold text-[var(--color-text-primary)]">
              Group not found
            </h1>
            <p className="mt-2 text-sm text-[var(--color-text-secondary)]">
              This group may already have been resolved, or the link is no longer valid.
            </p>
          </div>
          <button
            type="button"
            onClick={goBack}
            className="rounded-lg bg-[var(--color-brand-primary)] px-4 py-2 text-sm font-semibold text-white"
          >
            Back to new requests
          </button>
        </div>
      </AdminPageScroll>
    );
  }

  return (
    <AdminPageScroll dataPage="group-detail" contentClassName="min-w-0 select-none pb-2">
      <Toast />
      <GroupResolutionView
        group={group}
        directory={directory}
        onResolved={handleResolved}
      />
    </AdminPageScroll>
  );
}
