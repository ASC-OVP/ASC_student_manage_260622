# ASC UI Foundation

ASC 공통 UI는 KRDS(Korea Design System)의 스타일, 컴포넌트, 기본 패턴, 서비스 패턴을 업무용 학원 운영 시스템에 맞게 축약 적용한다. 이 단계의 목적은 화면을 한 번에 갈아엎는 것이 아니라, 이후 기능별 화면을 같은 기준으로 치환할 수 있는 토큰과 컴포넌트 토대를 만드는 것이다.

## KRDS 적용 원칙

- 명확성: 페이지 상단에 제목, 설명, 핵심 액션을 고정된 순서로 배치한다.
- 일관성: 같은 의미의 액션은 같은 위치와 같은 버튼 위계로 표현한다.
- 접근성: label, aria-describedby, focus-visible, 충분한 대비, 색상 외 텍스트 라벨을 함께 사용한다.
- 업무 효율: 검색/필터는 목록 바로 위에 모으고, 표는 스캔 가능한 밀도로 유지한다.
- 단계 과업: OMR처럼 절차가 있는 기능은 Stepper, Tabs, Drawer, Notice를 조합해 현재 단계와 다음 행동을 분명히 한다.

## Token 기준

| 영역 | CSS 변수 | 사용 기준 |
| --- | --- | --- |
| 주요색 | `--asc-color-primary`, `--asc-color-primary-hover`, `--asc-color-primary-soft` | 저장, 등록, 업로드, 채점 등 핵심 액션과 현재 선택 상태 |
| 표면 | `--asc-color-bg`, `--asc-color-bg-subtle`, `--asc-color-surface` | 앱 배경, 필터/표/패널 배경 |
| 텍스트 | `--asc-color-text`, `--asc-color-text-subtle`, `--asc-color-text-muted` | 본문, 보조 설명, 메타 정보 |
| 선 | `--asc-color-border`, `--asc-color-border-strong`, `--asc-border-width` | 표, 입력, 카드, 패널 구분 |
| 상태 | `--asc-color-danger`, `--asc-color-warning`, `--asc-color-success`, `--asc-color-info` | 실패/주의/완료/정보 상태 배지와 알림 |
| 간격 | `--asc-space-1` ~ `--asc-space-10` | 4px 기반 간격 체계. 업무 화면은 8~12px 중심으로 밀도 있게 구성 |
| 모서리 | `--asc-radius-sm`, `--asc-radius-md`, `--asc-radius-lg`, `--asc-radius-xl` | 입력/버튼은 md, 카드/패널은 lg 이하를 기본으로 사용 |
| 그림자 | `--asc-shadow-sm`, `--asc-shadow-panel`, `--asc-shadow-modal` | 일반 화면에서는 최소화하고 모달/드로어에만 명확히 사용 |
| 포커스 | `--asc-focus-ring` | 키보드 사용자가 현재 위치를 알 수 있게 모든 상호작용 요소에 적용 |

## Component Mapping

| KRDS 패턴 | ASC 컴포넌트 | 적용 화면 |
| --- | --- | --- |
| 버튼 | `Button`, `ButtonLink` | 새 학생, 저장, 업로드, 채점, 발송, 삭제 |
| 입력 필드 | `Input`, `Select`, `Textarea` | 학생/반/업무/문자/OMR 폼 |
| 상태 표시 | `Badge`, `StatusBadge`, `Notice` | 학생 상태, 업무 상태, 문자 발송 결과, OMR 처리 상태 |
| 페이지 구조 | `PageHeader`, `SectionHeader`, `Card` | 대시보드, 학생 현황판, 반 관리, 근무/급여 |
| 검색/필터 | `FilterBar` | 학생 목록, 반 목록, 업무 목록, 메시지 로그, OMR 검사 목록 |
| 데이터 목록 | `DataTable`, `EmptyState` | 학생/반/업무/문자/OMR 결과 표 |
| 단계/탭 | `Tabs`, `StatusBadge` 조합 | OMR 검사 흐름, 학생 상세 하위 정보, 운영 안정화 |
| 집중 작업 | `Modal`, `Drawer` | 새로 만들기, 상세 편집, OMR 검수, 위험 액션 확인 |

## 다음 적용 순서

1. OMR: 8단계 과업 흐름, 업로드 상태, 검수/채점 결과 표를 공통 컴포넌트로 치환한다.
2. 학생 현황판/학생 상세: PageHeader, FilterBar, DataTable, StatusBadge를 우선 적용한다.
3. 반 관리: 목록/상세 2패널 구조와 상태 배지를 통일한다.
4. 업무 관리: 상태/담당/마감 필터와 위험 액션 위치를 통일한다.
5. 문자/메모: 작성 폼, 로그 표, 빈 상태, 실패 알림을 공통 컴포넌트로 바꾼다.
6. 근무/급여/운영/직원: 표 밀도, 월 필터, 확정/경고 상태를 토큰 기반으로 정리한다.