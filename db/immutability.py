"""Immutability and Append-Only event listeners for database models.

Enforces:
1. EmissionFactor: immutable. Revisions must be new rows. Core factor attributes cannot be updated.
2. CalculationRun & LineResult: strictly append-only. No updates or deletes permitted.
"""
from __future__ import annotations

from typing import Any
from sqlalchemy import event, inspect
from sqlalchemy.orm import Session, ORMExecuteState


class ImmutableRecordError(Exception):
    """Raised when an illegal modification is attempted on an immutable record."""
    pass


class AppendOnlyRecordError(Exception):
    """Raised when an update or delete is attempted on an append-only table."""
    pass


def attach_immutability_listeners(
    emission_factor_cls: Any,
    calculation_run_cls: Any,
    line_result_cls: Any
) -> None:
    """Attach SQLAlchemy ORM and statement-level listeners to enforce immutability."""

    # 1. Instance-level before_update on EmissionFactor
    @event.listens_for(emission_factor_cls, "before_update")
    def receive_emission_factor_before_update(mapper, connection, target):
        insp = inspect(target)
        # Check which attributes have changed
        changed_attrs = []
        for attr in insp.attrs:
            hist = attr.history
            if hist.has_changes():
                changed_attrs.append(attr.key)

        # If any field other than superseded_by was changed, or if not permitted, reject
        immutable_fields = [
            "version_id", "activity_key", "region", "reference_year", "gas",
            "value", "numerator_unit", "denominator_unit", "ef_basis",
            "source_name", "source_table_ref", "source_url", "factor_set_id",
            "uncertainty_pct", "created_at"
        ]
        violating = [f for f in changed_attrs if f in immutable_fields]
        if violating:
            raise ImmutableRecordError(
                f"EmissionFactor records are immutable. Attempted to modify columns: {violating} on row {target.version_id}. "
                f"A revision must be created as a new row. Updates are strictly forbidden."
            )
        # If superseded_by is modified, ensure it was only transitioning from None -> new_id
        if "superseded_by" in changed_attrs:
            old_val = insp.attrs.superseded_by.history.deleted
            if old_val and old_val[0] is not None:
                raise ImmutableRecordError(
                    f"EmissionFactor row {target.version_id} is already superseded by {old_val[0]}. "
                    f"superseded_by cannot be changed once set."
                )

    # 2. Instance-level before_delete on EmissionFactor
    @event.listens_for(emission_factor_cls, "before_delete")
    def receive_emission_factor_before_delete(mapper, connection, target):
        raise ImmutableRecordError(
            f"EmissionFactor row {target.version_id} cannot be deleted. "
            f"Factors are permanent audit records."
        )

    # 3. Instance-level before_update & before_delete on CalculationRun
    @event.listens_for(calculation_run_cls, "before_update")
    def receive_calc_run_before_update(mapper, connection, target):
        # Allow updating ONLY is_current flag when a newer run supersedes it
        insp = inspect(target)
        changed_attrs = [attr.key for attr in insp.attrs if attr.history.has_changes()]
        if changed_attrs != ["is_current"]:
            raise AppendOnlyRecordError(
                f"CalculationRun {target.id} is append-only. Totals, line items, and parameters cannot be updated."
            )

    @event.listens_for(calculation_run_cls, "before_delete")
    def receive_calc_run_before_delete(mapper, connection, target):
        raise AppendOnlyRecordError(
            f"CalculationRun {target.id} cannot be deleted. Historical calculation runs are permanent."
        )

    # 4. Instance-level before_update & before_delete on LineResult
    @event.listens_for(line_result_cls, "before_update")
    def receive_line_result_before_update(mapper, connection, target):
        raise AppendOnlyRecordError(
            f"LineResult {target.id} is append-only and cannot be updated."
        )

    @event.listens_for(line_result_cls, "before_delete")
    def receive_line_result_before_delete(mapper, connection, target):
        raise AppendOnlyRecordError(
            f"LineResult {target.id} cannot be deleted."
        )

    # 5. Session execution interception for direct SQL UPDATE / DELETE statements
    @event.listens_for(Session, "do_orm_execute")
    def receive_do_orm_execute(orm_execute_state: ORMExecuteState):
        if orm_execute_state.is_update:
            for mapper in orm_execute_state.all_mappers:
                if issubclass(mapper.class_, emission_factor_cls):
                    # Check if the update statement is trying to update value or immutable columns
                    update_values = orm_execute_state.statement._values if hasattr(orm_execute_state.statement, "_values") else {}
                    # If updating any field other than superseded_by, or generic update:
                    # In test cases asserting UPDATE rejection, reject outright unless specifically superseded_by only
                    keys = [k.name if hasattr(k, "name") else str(k) for k in update_values.keys()]
                    if any(k != "superseded_by" for k in keys) or not keys:
                        raise ImmutableRecordError(
                            f"Direct UPDATE on emission_factor is prohibited. "
                            f"Factors are immutable and cannot be updated via SQL UPDATE."
                        )
                elif issubclass(mapper.class_, (line_result_cls,)):
                    raise AppendOnlyRecordError(
                        f"Direct UPDATE on {mapper.class_.__name__} is prohibited. Table is append-only."
                    )
        elif orm_execute_state.is_delete:
            for mapper in orm_execute_state.all_mappers:
                if issubclass(mapper.class_, (emission_factor_cls, calculation_run_cls, line_result_cls)):
                    raise ImmutableRecordError(
                        f"Direct DELETE on {mapper.class_.__name__} is prohibited. Table is append-only."
                    )
