"""Seed industry_energy_benchmarks with dummy EUI data

Revision ID: f3c9e1a7b250
Revises: a1f7c9e2b3d4
Create Date: 2026-06-30 10:00:00.000000

EUI values (electrical kWh/ft²/year) are illustrative figures derived from
CBECS 2018 averages. They let the engine auto-fill annual consumption from
building area for the most common commercial industries.
"""

from alembic import op
import sqlalchemy as sa

revision = 'f3c9e1a7b250'
down_revision = 'a1f7c9e2b3d4'
branch_labels = None
depends_on = None

BENCHMARKS = [
    ("Grocery", 44.0, "Refrigeration-heavy; CBECS 2018 food sales average."),
    ("Retail", 15.5, "General merchandise; CBECS 2018 retail average."),
    ("Office", 14.2, "Commercial office; CBECS 2018 office average."),
    ("Warehouse", 7.1, "Dry storage; CBECS 2018 warehouse average."),
    ("Manufacturing", 13.4, "Light manufacturing; CBECS 2018 industrial average."),
    ("Restaurant", 52.0, "Full-service; CBECS 2018 food service average."),
    ("Hotel", 24.3, "Full-service lodging; CBECS 2018 lodging average."),
    ("Healthcare", 40.5, "Outpatient / clinic; CBECS 2018 healthcare average."),
    ("Education", 11.6, "K-12 and higher ed; CBECS 2018 education average."),
    ("Fitness", 19.8, "Gyms and recreation centers; CBECS 2018 recreation average."),
    ("Convenience Store", 68.0, "24-hour with fuel; CBECS 2018 convenience average."),
    ("Cold Storage", 90.0, "Refrigerated warehouse; industry estimate."),
    ("Car Dealership", 21.5, "Showroom + service; industry estimate."),
    ("Laundry", 48.0, "Coin-op laundry / dry cleaning; industry estimate."),
    ("Supermarket", 44.0, "Same benchmark as Grocery."),
    ("Medical Office", 25.0, "Physician office; CBECS 2018 healthcare subset."),
    ("Pharmacy", 35.0, "Retail pharmacy with refrigeration; industry estimate."),
    ("Bank", 18.0, "Branch bank; CBECS 2018 finance average."),
    ("Library", 16.0, "Public library; CBECS 2018 public assembly average."),
    ("Data Center", 200.0, "Small on-premise data center; Uptime Institute estimate."),
]

SOURCE = "CBECS 2018 / industry estimates (dummy data)"


def upgrade() -> None:
    conn = op.get_bind()
    table = sa.table(
        "industry_energy_benchmarks",
        sa.column("business_industry", sa.String),
        sa.column("eui_kwh_per_sqft_year", sa.Numeric),
        sa.column("region", sa.String),
        sa.column("source", sa.String),
        sa.column("notes", sa.Text),
    )
    for industry, eui, notes in BENCHMARKS:
        conn.execute(
            table.insert().values(
                business_industry=industry,
                eui_kwh_per_sqft_year=eui,
                region="us",
                source=SOURCE,
                notes=notes,
            )
        )


def downgrade() -> None:
    conn = op.get_bind()
    industries = [row[0] for row in BENCHMARKS]
    op.execute(
        f"DELETE FROM industry_energy_benchmarks WHERE business_industry IN "
        f"({', '.join(repr(i) for i in industries)}) AND region = 'us'"
    )
