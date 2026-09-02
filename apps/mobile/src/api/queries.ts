import type {
  CardSummary,
  CertDto,
  CertListDto,
  GradeNameDto,
} from '@macgrading/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from './client';
import { useAuth } from '../auth/auth-context';

export const certKeys = {
  list: (q: string) => ['certs', q] as const,
  detail: (certNumber: string) => ['cert', certNumber] as const,
};

export function useCerts(q: string) {
  return useQuery({
    queryKey: certKeys.list(q),
    queryFn: () =>
      apiFetch<CertListDto>(`/certs?pageSize=50${q ? `&q=${encodeURIComponent(q)}` : ''}`),
  });
}

export function useCert(certNumber: string) {
  return useQuery({
    queryKey: certKeys.detail(certNumber),
    queryFn: () => apiFetch<CertDto>(`/certs/${certNumber}`),
  });
}

export function useCardSearch(q: string) {
  const { token } = useAuth();
  return useQuery({
    queryKey: ['cards', q],
    queryFn: () =>
      apiFetch<CardSummary[]>(`/cards/search?q=${encodeURIComponent(q)}`, { token }),
    enabled: q.trim().length >= 2,
  });
}

export function useGradeNames() {
  const { token } = useAuth();
  return useQuery({
    queryKey: ['grade-names'],
    queryFn: () => apiFetch<GradeNameDto[]>('/grade-names', { token }),
  });
}

export function useMintCert() {
  const { token } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      cardboardTensId: string;
      isPrototype: boolean;
      grade?: string;
    }) => apiFetch<CertDto>('/certs', { method: 'POST', body: input, token }),
    onSuccess: (cert) => {
      queryClient.invalidateQueries({ queryKey: ['certs'] });
      queryClient.setQueryData(certKeys.detail(cert.certNumber), cert);
    },
  });
}

export function useSetGrade(certNumber: string) {
  const { token } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (grade: string) =>
      apiFetch<CertDto>(`/certs/${certNumber}/grade`, {
        method: 'PATCH',
        body: { grade },
        token,
      }),
    onSuccess: (cert) => {
      queryClient.invalidateQueries({ queryKey: ['certs'] });
      queryClient.setQueryData(certKeys.detail(cert.certNumber), cert);
    },
  });
}
