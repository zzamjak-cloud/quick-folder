; QuickFolder Widget NSIS 설치 훅
;
; qf-mcp.exe 는 AI 에이전트(Claude Code, Codex, Cursor ...)가 stdio 서버로 띄워
; 에이전트 세션이 사는 동안 계속 상주한다. 그 상태로 설치를 진행하면 NSIS 가 잠긴
; 파일을 덮어쓰지 못하고 "Error opening file for writing" 대화상자에서 멈춘다.
; 자동 업데이트(무인 설치)에서도 같은 지점에서 걸린다.
;
; 설치·제거 직전에 정리한다. 에이전트는 stdio 서버가 끊기면 다음 호출 때 새로
; 띄우므로 사용자가 잃는 것은 없다.
;
; 주의: 업데이터가 /S 무인 모드로도 실행하므로 여기서 MessageBox 를 띄우면 안 된다.
; 설치가 사용자 눈에 보이지 않는 채로 멈춘다.

!macro QF_STOP_MCP_SERVER
  ; taskkill 은 대상이 없으면 128 을 돌려준다 — 정상이므로 결과를 무시한다.
  nsExec::Exec '"$SYSDIR\taskkill.exe" /F /T /IM qf-mcp.exe'
  Pop $0
  ; 핸들이 실제로 닫힐 때까지 잠깐 기다린다. 종료 직후에는 아직 잠겨 있을 수 있다.
  Sleep 500
!macroend

!macro NSIS_HOOK_PREINSTALL
  !insertmacro QF_STOP_MCP_SERVER
!macroend

!macro NSIS_HOOK_PREUNINSTALL
  !insertmacro QF_STOP_MCP_SERVER
!macroend
