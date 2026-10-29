"""
SmartLearn Master Quality Assurance & Test Verification Suite
=============================================================
Orchestrates end-to-end execution of all role-specific functional, integration,
security, and performance test suites:
- Suite 1: Student Role (19 tests)
- Suite 2: Instructor Role (14 tests)
- Suite 3: Admin Role (14 tests)
- Suite 4: Security & RBAC Guardrails (12 tests)
- Suite 5: Performance & Latency Benchmarks (8 benchmarks)
"""

import sys
import os
import time
from datetime import datetime

# Add directory to sys.path
from pathlib import Path
QA_DIR = Path(__file__).resolve().parent
ROOT_DIR = QA_DIR.parent.parent.parent
sys.path.insert(0, str(QA_DIR))
sys.path.insert(0, str(ROOT_DIR / 'backend'))
sys.path.insert(0, str(ROOT_DIR))

from qa_student_suite import run_student_qa
from qa_instructor_suite import run_instructor_qa
from qa_admin_suite import run_admin_qa
from qa_security_suite import run_security_qa
from qa_performance_suite import run_performance_benchmarks

def run_master_qa():
    start_time = time.time()
    print("=" * 80)
    print("SMARTLEARN MASTER QUALITY ASSURANCE & AUDIT RUNNER")
    print(f"Timestamp: {datetime.utcnow().strftime('%Y-%m-%d %H:%M:%S UTC')}")
    print("=" * 80)
    
    suite_summaries = []
    
    # 1. Student QA Suite
    print("\n>>> EXECUTING SUITE 1: STUDENT ROLE WORKFLOWS")
    s_results = run_student_qa()
    s_pass = sum(1 for _, s, _ in s_results if s == "PASS")
    suite_summaries.append(("Student Workflows", s_pass, len(s_results)))
    
    # 2. Instructor QA Suite
    print("\n>>> EXECUTING SUITE 2: INSTRUCTOR ROLE WORKFLOWS")
    i_results = run_instructor_qa()
    i_pass = sum(1 for _, s, _ in i_results if s == "PASS")
    suite_summaries.append(("Instructor Workflows", i_pass, len(i_results)))
    
    # 3. Admin QA Suite
    print("\n>>> EXECUTING SUITE 3: ADMIN ROLE WORKFLOWS")
    a_results = run_admin_qa()
    a_pass = sum(1 for _, s, _ in a_results if s == "PASS")
    suite_summaries.append(("Admin Workflows", a_pass, len(a_results)))
    
    # 4. Security QA Suite
    print("\n>>> EXECUTING SUITE 4: SECURITY, RBAC & AUTHORIZATION GUARDRAILS")
    sec_results = run_security_qa()
    sec_pass = sum(1 for _, s, _ in sec_results if s == "PASS")
    suite_summaries.append(("Security & Guardrails", sec_pass, len(sec_results)))
    
    # 5. Performance Benchmarks
    print("\n>>> EXECUTING SUITE 5: PERFORMANCE & LATENCY BENCHMARKS")
    perf_results = run_performance_benchmarks()
    suite_summaries.append(("Performance Benchmarks", len(perf_results), len(perf_results)))
    
    total_elapsed = time.time() - start_time
    total_passed = sum(p for _, p, _ in suite_summaries)
    total_tests = sum(t for _, _, t in suite_summaries)
    pass_rate = (total_passed / total_tests) * 100.0 if total_tests > 0 else 0
    
    print("\n" + "=" * 80)
    print("MASTER QA TEST AUDIT EXECUTION SUMMARY")
    print("=" * 80)
    print(f"{'Test Suite':<40} | {'Passed':<8} | {'Total':<8} | {'Pass Rate':<10}")
    print("-" * 80)
    for name, p, t in suite_summaries:
        rate = (p / t * 100.0) if t > 0 else 0
        print(f"{name:<40} | {p:<8} | {t:<8} | {rate:>8.1f}%")
    print("-" * 80)
    print(f"{'TOTAL AUDITED SPECIFICATIONS':<40} | {total_passed:<8} | {total_tests:<8} | {pass_rate:>8.1f}%")
    print(f"Total Execution Time: {total_elapsed:.2f} seconds")
    print("=" * 80)

if __name__ == "__main__":
    run_master_qa()
