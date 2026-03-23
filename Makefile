.PHONY: check deny audit typecheck

check: deny audit typecheck
	@echo "All checks passed"

deny:
	cd src-tauri && cargo deny check

audit:
	cd src-tauri && cargo audit

typecheck:
	npm run typecheck
